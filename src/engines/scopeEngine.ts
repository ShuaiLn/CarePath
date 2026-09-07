import type { IntakeRecord } from '../types/intake'
import type { OutOfScopeCategory } from '../types/engineOutcomes'

/**
 * Scope Boundaries — see docs/CarePath_AI_Plan.md Section 11.
 *
 * These categories are not scored by the generic care-level engine. They
 * are called out by name and route directly to OUT_OF_SCOPE with guidance
 * to seek professional care, because the generic weighting model was never
 * designed or validated for their risk profile.
 *
 * This check is deterministic and runs on structured, explicitly-reported
 * fields only — it never infers scope from free text the AI "thinks" it
 * understood, and it never fires on "unknown" values.
 */
export function checkScope(intake: IntakeRecord): OutOfScopeCategory | null {
  if (typeof intake.age?.value === 'number' && intake.age.value < 18) {
    return 'pediatric'
  }
  if (intake.isPregnantOrPossiblyPregnant?.value === 'reported') {
    return 'pregnancy'
  }
  if (intake.mentalHealthCrisisReported?.value === 'reported') {
    return 'mental_health_crisis'
  }
  if (intake.poisoningExposureReported?.value === 'reported') {
    return 'poisoning'
  }
  if (intake.traumaInjuryReported?.value === 'reported') {
    return 'trauma'
  }
  if (intake.sexualHealthConcernReported?.value === 'reported') {
    return 'sexual_health'
  }
  if (intake.postOperativeComplicationReported?.value === 'reported') {
    return 'post_operative_complication'
  }
  if (intake.immunocompromisedReported?.value === 'reported') {
    return 'immunocompromised'
  }
  return null
}
