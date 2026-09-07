import type { IntakeRecord, AssociatedSymptomId } from '../types/intake'

/**
 * Critical Red-Flag Override — see docs/CarePath_AI_Plan.md Section 4.
 *
 * Medical risk cannot rely solely on a weighted average. This is a
 * deterministic, rule-based check that runs BEFORE any weighted scoring.
 * If it fires, the care-level engine forces EMERGENCY regardless of the
 * weighted score. It is deliberately simple, explicit, and independent of
 * any LLM output — the AI never decides this.
 *
 * A red flag only fires on an EXPLICIT "reported" status. "unknown" (not
 * asked / not answered) must never be treated as "reported" — that would
 * fabricate a fact the user never gave — and must never be treated as
 * "denied" either, since that would hide a real risk behind a false "no."
 * Missing red-flag information is instead handled by the
 * INSUFFICIENT_INFORMATION path in the care-level engine.
 */

export interface RedFlagRule {
  id: string
  label: string
  isTriggered: (intake: IntakeRecord) => boolean
}

function reported(intake: IntakeRecord, id: AssociatedSymptomId): boolean {
  return intake.associatedSymptoms[id]?.value === 'reported'
}

export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    id: 'severeBreathingDifficulty',
    label: 'Severe difficulty breathing',
    isTriggered: (intake) => reported(intake, 'severeBreathingDifficulty'),
  },
  {
    id: 'concerningChestPain',
    label: 'Chest pain with concerning features',
    isTriggered: (intake) =>
      reported(intake, 'chestPain') &&
      (reported(intake, 'radiatingPain') ||
        reported(intake, 'sweatingWithChestPain') ||
        reported(intake, 'severeBreathingDifficulty') ||
        (intake.severity?.value ?? 0) >= 8),
  },
  {
    id: 'faintingOrLossOfConsciousness',
    label: 'Fainting or loss of consciousness',
    isTriggered: (intake) => reported(intake, 'faintingOrLossOfConsciousness'),
  },
  {
    id: 'severeBleeding',
    label: 'Severe or uncontrolled bleeding',
    isTriggered: (intake) => reported(intake, 'severeBleeding'),
  },
  {
    id: 'strokeSigns',
    label: 'Possible stroke signs',
    isTriggered: (intake) => reported(intake, 'strokeSigns'),
  },
  {
    id: 'severeConfusion',
    label: 'Sudden severe confusion',
    isTriggered: (intake) => reported(intake, 'severeConfusion'),
  },
  {
    id: 'throatSwelling',
    label: 'Throat or tongue swelling (possible severe allergic reaction)',
    isTriggered: (intake) => reported(intake, 'throatSwelling'),
  },
  {
    id: 'severeHeadacheWorstOfLife',
    label: 'Sudden, "worst headache of my life"',
    isTriggered: (intake) => reported(intake, 'severeHeadacheWorstOfLife'),
  },
]

export interface RedFlagCheckResult {
  triggered: boolean
  matchedRules: RedFlagRule[]
}

export function checkCriticalRedFlags(intake: IntakeRecord): RedFlagCheckResult {
  const matchedRules = RED_FLAG_RULES.filter((rule) => rule.isTriggered(intake))
  return { triggered: matchedRules.length > 0, matchedRules }
}
