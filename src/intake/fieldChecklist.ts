import type { AssociatedSymptomId } from '../types/intake'
import { ASSOCIATED_SYMPTOM_LABELS } from '../types/intake'

/**
 * Progressive follow-up question plan for Step 1 intake. See
 * docs/CarePath_AI_Plan.md Section 3 — natural-language entry with
 * progressive follow-up questions, not a form dump.
 *
 * Each question targets one field. The conversation engine asks these in
 * order, skipping anything already captured (with reasonable confidence)
 * from the user's free-text messages.
 */
export type IntakeQuestionId =
  | 'severity'
  | 'onset'
  | 'trend'
  | 'age'
  | 'pregnancy'
  | 'screeningSymptoms'
  | 'moreScreeningSymptoms'
  | 'medicalConditions'
  | 'currentMedications'
  | 'allergies'
  | 'scopeCheck'

export interface IntakeQuestion {
  id: IntakeQuestionId
  prompt: string
}

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  { id: 'onset', prompt: 'When did this start, and has it been constant or does it come and go?' },
  { id: 'severity', prompt: 'On a scale of 0 to 10, how severe is it right now?' },
  { id: 'trend', prompt: 'Is it getting better, staying about the same, or getting worse?' },
  {
    id: 'screeningSymptoms',
    prompt:
      'Do you have any of the following: severe difficulty breathing, chest pain, fainting or loss of consciousness, or severe/uncontrolled bleeding? (yes/no for each, or list which ones)',
  },
  {
    id: 'moreScreeningSymptoms',
    prompt: 'Any fever, nausea, or vomiting?',
  },
  { id: 'age', prompt: 'What is your age?' },
  {
    id: 'pregnancy',
    prompt: 'Is there any chance you are pregnant, or is this related to pregnancy?',
  },
  {
    id: 'scopeCheck',
    prompt:
      'A few quick screening questions: is this related to a recent injury/accident, a recent surgery or procedure, a possible poisoning or overdose, or a mental health crisis? Also, do you have a weakened immune system?',
  },
  { id: 'medicalConditions', prompt: 'Do you have any ongoing medical conditions (e.g. diabetes, heart disease)? If none, just say "none."' },
  { id: 'currentMedications', prompt: 'Are you currently taking any medications? If none, just say "none."' },
  { id: 'allergies', prompt: 'Do you have any known allergies? If none, just say "none."' },
]

export const CRITICAL_SCREENING_IDS: AssociatedSymptomId[] = [
  'severeBreathingDifficulty',
  'chestPain',
  'faintingOrLossOfConsciousness',
  'severeBleeding',
]

export const SECONDARY_SCREENING_IDS: AssociatedSymptomId[] = ['fever', 'nausea', 'vomiting']

export function screeningQuestionText(ids: AssociatedSymptomId[]): string {
  return ids.map((id) => ASSOCIATED_SYMPTOM_LABELS[id]).join(', ')
}
