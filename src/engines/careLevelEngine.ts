import type { IntakeRecord } from '../types/intake'
import type { CareLevelFactor, CareLevelResult, CareLevelTier } from '../types/careLevel'
import type { EngineOutcome } from '../types/engineOutcomes'
import { insufficientInformation, outOfScope } from '../types/engineOutcomes'
import { checkCriticalRedFlags } from './redFlagEngine'
import { checkScope } from './scopeEngine'

/**
 * Care-Level Assessment engine — see docs/CarePath_AI_Plan.md Section 4.
 *
 * Governing pattern (Section 12):
 *   Safety rules -> structured risk engine -> LLM explanation
 * never:
 *   Symptoms -> LLM -> "probably green"
 *
 * This module only ever consumes a structured, sanitized IntakeRecord. It
 * has no code path that reads a "care level" or "recommended tier" from an
 * LLM/extraction result — that field does not exist anywhere in the
 * IntakeRecord type, so an LLM cannot inject or override the final tier.
 * The AI's role is limited to producing the structured factors that feed
 * this engine and to explaining the result afterward in plain language.
 *
 * Order of evaluation, most safety-critical first:
 *   1. Critical Red-Flag Override (deterministic) - always wins.
 *   2. Scope boundaries (Section 11) - generic engine does not score these.
 *   3. INSUFFICIENT_INFORMATION - required inputs are missing/too sparse.
 *   4. Weighted scoring -> categorical tier (Section 4 table).
 */

const REQUIRED_FIELDS: { key: keyof IntakeRecord; label: string }[] = [
  { key: 'chiefComplaint', label: 'what is bothering you' },
  { key: 'severity', label: 'how severe it is' },
  { key: 'durationPattern', label: 'whether it is constant or comes and goes' },
]

// Non-critical associated symptoms the checklist should cover before we
// trust an absence of critical symptoms enough to score normally. If none
// of these (nor the critical red-flag list) have been asked about at all,
// the input is too sparse to safely score.
const SCREENING_SYMPTOM_IDS = [
  'fever',
  'nausea',
  'vomiting',
  'severeBreathingDifficulty',
  'chestPain',
  'faintingOrLossOfConsciousness',
  'severeBleeding',
] as const

function getMissingFields(intake: IntakeRecord): string[] {
  const missing: string[] = []
  for (const field of REQUIRED_FIELDS) {
    if (intake[field.key] === undefined) missing.push(field.label)
  }
  const askedCount = SCREENING_SYMPTOM_IDS.filter(
    (id) => intake.associatedSymptoms[id] !== undefined,
  ).length
  if (askedCount === 0) {
    missing.push('whether you have any warning symptoms like fever, breathing trouble, or fainting')
  }
  return missing
}

function scoreToTier(score: number): CareLevelTier {
  if (score >= 80) return 'EMERGENCY'
  if (score >= 60) return 'SAME_DAY_URGENT'
  if (score >= 40) return 'SCHEDULE_SOON'
  return 'SELF_CARE'
}

/**
 * Weighted urgency score, 0-100. This is a demonstration heuristic only —
 * NOT a validated clinical model (see docs/CarePath_AI_Plan.md Section 14).
 * It is never shown to the user; only the categorical tier it maps to is.
 */
function computeWeightedScore(intake: IntakeRecord): { score: number; factors: CareLevelFactor[] } {
  let score = 0
  const factors: CareLevelFactor[] = []

  const severity = intake.severity?.value ?? 0
  if (severity > 0) {
    score += severity * 6
    if (severity >= 7) {
      factors.push({ id: 'severity', label: 'Severity', detail: `Reported pain/severity ${severity}/10` })
    }
  }

  if (intake.trend?.value === 'worsening') {
    score += 15
    factors.push({ id: 'trend', label: 'Trend', detail: 'Symptoms are getting worse' })
  } else if (intake.trend?.value === 'improving') {
    score -= 10
  }

  if (typeof intake.onsetHours?.value === 'number' && intake.onsetHours.value <= 6 && severity >= 6) {
    score += 10
    factors.push({ id: 'sudden_onset', label: 'Sudden onset', detail: 'Started suddenly, within the last few hours' })
  }

  const concerningAssociated: { id: keyof typeof intake.associatedSymptoms; label: string; points: number }[] = [
    { id: 'fever', label: 'Fever reported', points: 8 },
    { id: 'vomiting', label: 'Vomiting reported', points: 6 },
    { id: 'bloodInStoolOrVomit', label: 'Blood in stool or vomit reported', points: 20 },
    { id: 'unableToKeepFluidsDown', label: 'Unable to keep fluids down', points: 15 },
  ]
  for (const item of concerningAssociated) {
    if (intake.associatedSymptoms[item.id]?.value === 'reported') {
      score += item.points
      factors.push({ id: String(item.id), label: item.label, detail: item.label })
    }
  }

  const age = intake.age?.value
  if (typeof age === 'number' && age >= 65) {
    score += 10
    factors.push({ id: 'age', label: 'Age', detail: 'Age 65 or older' })
  }

  const conditions = (intake.medicalConditions?.value ?? []).map((c) => c.toLowerCase())
  const riskyConditionKeywords = ['heart', 'diabetes', 'immun', 'cancer', 'kidney', 'copd', 'asthma']
  if (conditions.some((c) => riskyConditionKeywords.some((k) => c.includes(k)))) {
    score += 10
    factors.push({ id: 'conditions', label: 'Existing conditions', detail: 'Has an existing condition that can raise risk' })
  }

  const medications = (intake.currentMedications?.value ?? []).map((m) => m.toLowerCase())
  const riskyMedKeywords = ['warfarin', 'xarelto', 'eliquis', 'coumadin', 'anticoagulant', 'blood thinner']
  if (medications.some((m) => riskyMedKeywords.some((k) => m.includes(k)))) {
    score += 8
    factors.push({ id: 'medications', label: 'Current medications', detail: 'Taking a medication that can raise risk (e.g. blood thinner)' })
  }

  if (intake.durationPattern?.value) {
    factors.push({ id: 'duration', label: 'Duration', detail: intake.durationPattern.value })
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), factors }
}

export function assessCareLevel(intake: IntakeRecord): EngineOutcome<CareLevelResult> {
  const redFlags = checkCriticalRedFlags(intake)
  if (redFlags.triggered) {
    return {
      kind: 'RESULT',
      result: {
        tier: 'EMERGENCY',
        redFlagOverride: true,
        triggeredRedFlags: redFlags.matchedRules.map((r) => r.label),
        factors: redFlags.matchedRules.map((r) => ({ id: r.id, label: r.label, detail: r.label })),
        internalScore: 100,
      },
    }
  }

  const scopeCategory = checkScope(intake)
  if (scopeCategory) {
    return outOfScope(scopeCategory)
  }

  const missingFields = getMissingFields(intake)
  if (missingFields.length > 0) {
    return insufficientInformation(missingFields)
  }

  const { score, factors } = computeWeightedScore(intake)
  return {
    kind: 'RESULT',
    result: {
      tier: scoreToTier(score),
      redFlagOverride: false,
      triggeredRedFlags: [],
      factors,
      internalScore: score,
    },
  }
}
