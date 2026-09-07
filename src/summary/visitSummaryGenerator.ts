import type { IntakeRecord, AssociatedSymptomId } from '../types/intake'
import { ASSOCIATED_SYMPTOM_LABELS } from '../types/intake'
import type { EngineOutcome } from '../types/engineOutcomes'
import type { CareLevelResult } from '../types/careLevel'
import { CARE_LEVEL_LABELS } from '../types/careLevel'
import type { CareRoutingResult } from '../types/careRouting'
import type { SymptomStatusLine, VisitSummary } from '../types/visitSummary'

/**
 * Doctor Visit Summary generator — see docs/CarePath_AI_Plan.md Section 7.
 *
 * Deliberately template-based:
 *   Conversation -> structured facts -> template -> summary   (this file)
 * never:
 *   Conversation -> LLM freestyle summary
 *
 * so the summary can never say something the structured intake data
 * doesn't support. Every value not explicitly provided renders as "Not
 * provided" rather than being invented, and symptoms use the strict
 * Reported/Denied/Unknown tri-state.
 */

export const TOP_BANNER_DISCLAIMER =
  'Prepared from information entered by the patient. Not reviewed by a healthcare professional.'

export const NAVIGATION_RESULT_DISCLAIMER = "CarePath's navigation assessment is not a diagnosis."

function notProvided<T>(value: T | null | undefined, fmt: (v: T) => string): string | null {
  return value === null || value === undefined ? null : fmt(value)
}

function buildSymptomLines(intake: IntakeRecord): VisitSummary['otherSymptomsIReported'] {
  const reported: SymptomStatusLine[] = []
  const denied: SymptomStatusLine[] = []
  const unknown: SymptomStatusLine[] = []

  const allIds = Object.keys(ASSOCIATED_SYMPTOM_LABELS) as AssociatedSymptomId[]
  for (const id of allIds) {
    const entry = intake.associatedSymptoms[id]
    const line: SymptomStatusLine = { id, label: ASSOCIATED_SYMPTOM_LABELS[id], status: entry?.value ?? 'unknown' }
    if (line.status === 'reported') reported.push(line)
    else if (line.status === 'denied') denied.push(line)
    else unknown.push(line)
  }
  return { reported, denied, unknown }
}

/**
 * Generated from information gaps, never diagnostic speculation. Must
 * never contain suspected-condition phrasing like "Could this be
 * appendicitis?" — see Section 7.
 */
function buildDoctorQuestions(intake: IntakeRecord): string[] {
  const questions: string[] = ['Should I have any tests based on these symptoms?']

  if (intake.currentMedications?.value && intake.currentMedications.value.length > 0) {
    questions.push('Could any of my current medications be related to these symptoms, or affect treatment?')
  }

  questions.push('Are there activities or foods I should avoid until this improves?')
  questions.push('What changes would mean I should seek urgent care?')

  return questions
}

function careLevelTierOf(outcome: EngineOutcome<CareLevelResult>): VisitSummary['carePathNavigationResult']['careLevelTier'] {
  if (outcome.kind === 'RESULT') return outcome.result.tier
  return outcome.kind
}

function careLevelLabelOf(outcome: EngineOutcome<CareLevelResult>): string {
  if (outcome.kind === 'RESULT') return CARE_LEVEL_LABELS[outcome.result.tier]
  return outcome.message
}

function routingResultOf(outcome: EngineOutcome<CareRoutingResult> | null): CareRoutingResult | null {
  if (!outcome || outcome.kind !== 'RESULT') return null
  return outcome.result
}

export function generateVisitSummary(
  intake: IntakeRecord,
  careLevelOutcome: EngineOutcome<CareLevelResult>,
  careRoutingOutcome: EngineOutcome<CareRoutingResult> | null,
): VisitSummary {
  return {
    generatedAt: new Date().toISOString(),
    disclaimer: TOP_BANNER_DISCLAIMER,

    whyImSeekingCare: {
      chiefComplaint: notProvided(intake.chiefComplaint?.value, (v) => v),
      startedWhen: notProvided(intake.onsetDescription?.value ?? intake.durationPattern?.value, (v) => v),
      severity: notProvided(intake.severity?.value, (v) => `${v}/10`),
      progression: notProvided(intake.trend?.value, (v) => v),
    },

    otherSymptomsIReported: buildSymptomLines(intake),

    relevantContext: {
      medicalConditions: notProvided(intake.medicalConditions?.value, (v) => (v.length ? v.join(', ') : 'None reported')),
      currentMedications: notProvided(intake.currentMedications?.value, (v) => (v.length ? v.join(', ') : 'None reported')),
      allergies: notProvided(intake.allergies?.value, (v) => (v.length ? v.join(', ') : 'None reported')),
      recentEvents: notProvided(intake.recentProceduresOrInjuries?.value, (v) => v),
    },

    carePathNavigationResult: {
      careLevelTier: careLevelTierOf(careLevelOutcome),
      careLevelLabel: careLevelLabelOf(careLevelOutcome),
      routing: routingResultOf(careRoutingOutcome),
      disclaimer: NAVIGATION_RESULT_DISCLAIMER,
    },

    questionsForMyDoctor: buildDoctorQuestions(intake),
  }
}
