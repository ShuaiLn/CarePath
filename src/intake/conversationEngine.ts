import type { AssociatedSymptomId, AssociatedSymptoms, IntakeRecord } from '../types/intake'
import type { IntakeQuestion, IntakeQuestionId } from './fieldChecklist'
import { INTAKE_QUESTIONS, CRITICAL_SCREENING_IDS, SECONDARY_SCREENING_IDS } from './fieldChecklist'

/**
 * Pure, deterministic conversation-flow helpers for progressive follow-up
 * questioning (docs/CarePath_AI_Plan.md Section 3). These functions never
 * call an LLM and never decide anything safety-relevant — they only decide
 * *which question to ask next* based on what structured data is already
 * present, so the chat doesn't dump a form or re-ask something already
 * answered.
 */

const SCOPE_CHECK_KEYS: (keyof IntakeRecord)[] = [
  'traumaInjuryReported',
  'postOperativeComplicationReported',
  'poisoningExposureReported',
  'mentalHealthCrisisReported',
  'immunocompromisedReported',
  'sexualHealthConcernReported',
]

export function isQuestionAnswered(question: IntakeQuestion, intake: IntakeRecord): boolean {
  switch (question.id) {
    case 'onset':
      return intake.durationPattern !== undefined
    case 'severity':
      return intake.severity !== undefined
    case 'trend':
      return intake.trend !== undefined
    case 'screeningSymptoms':
      return CRITICAL_SCREENING_IDS.every((id) => intake.associatedSymptoms[id] !== undefined)
    case 'moreScreeningSymptoms':
      return SECONDARY_SCREENING_IDS.every((id) => intake.associatedSymptoms[id] !== undefined)
    case 'age':
      return intake.age !== undefined
    case 'pregnancy':
      return intake.isPregnantOrPossiblyPregnant !== undefined
    case 'scopeCheck':
      return SCOPE_CHECK_KEYS.every((key) => intake[key] !== undefined)
    case 'medicalConditions':
      return intake.medicalConditions !== undefined
    case 'currentMedications':
      return intake.currentMedications !== undefined
    case 'allergies':
      return intake.allergies !== undefined
  }
}

export function pickNextQuestion(
  intake: IntakeRecord,
  askedIds: ReadonlySet<IntakeQuestionId>,
): IntakeQuestion | null {
  for (const question of INTAKE_QUESTIONS) {
    if (askedIds.has(question.id)) continue
    if (!isQuestionAnswered(question, intake)) return question
  }
  return null
}

export function isReadyForConfirmation(intake: IntakeRecord, askedIds: ReadonlySet<IntakeQuestionId>): boolean {
  return pickNextQuestion(intake, askedIds) === null
}

/**
 * Merge a partial extraction result into the running intake record.
 * `associatedSymptoms` (and other scope flags) are merged key-by-key so a
 * new message can add information about one symptom without erasing
 * previously captured answers about others.
 */
export function mergeIntake(base: IntakeRecord, update: Partial<IntakeRecord>): IntakeRecord {
  const merged: IntakeRecord = { ...base, ...update }
  merged.associatedSymptoms = { ...base.associatedSymptoms, ...update.associatedSymptoms }
  return merged
}

export const MAX_CLARIFICATION_ATTEMPTS = 2

function pickAssociatedSymptoms(intake: IntakeRecord, ids: readonly AssociatedSymptomId[]): Partial<IntakeRecord> {
  const known: AssociatedSymptoms = {}
  for (const id of ids) {
    const value = intake.associatedSymptoms[id]
    if (value !== undefined) known[id] = value
  }
  return Object.keys(known).length > 0 ? { associatedSymptoms: known } : {}
}

function pickScopeFlags(intake: IntakeRecord): Partial<IntakeRecord> {
  const known: Partial<IntakeRecord> = {}
  for (const key of SCOPE_CHECK_KEYS) {
    const value = intake[key]
    if (value !== undefined) (known as Record<string, unknown>)[key] = value
  }
  return known
}

/**
 * Deterministically select the minimal slice of the running intake record
 * relevant to interpreting the current message, instead of sending the
 * full record to the LLM backend on every turn (data minimization — see
 * docs plan Part 3 "Minimize what's sent to OpenAI further"). Most
 * questions need no prior context at all; the narrow, enumerable
 * exceptions are the multi-symptom screening/scope questions, where
 * resolving an answer like "no, not anymore" benefits from knowing what's
 * already been reported so a blanket "no" is never mistaken for a
 * retraction of something already stated.
 */
export function selectRelevantContext(
  questionId: IntakeQuestionId | 'initial',
  currentIntake: IntakeRecord,
): Partial<IntakeRecord> {
  switch (questionId) {
    case 'screeningSymptoms':
      return pickAssociatedSymptoms(currentIntake, CRITICAL_SCREENING_IDS)
    case 'moreScreeningSymptoms':
      return pickAssociatedSymptoms(currentIntake, [...CRITICAL_SCREENING_IDS, ...SECONDARY_SCREENING_IDS])
    case 'scopeCheck':
      return pickScopeFlags(currentIntake)
    default:
      return {}
  }
}
