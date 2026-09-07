import { describe, it, expect } from 'vitest'
import { isQuestionAnswered, pickNextQuestion, isReadyForConfirmation, mergeIntake } from './conversationEngine'
import { INTAKE_QUESTIONS } from './fieldChecklist'
import { createEmptyIntakeRecord } from '../types/intake'
import { makeProvenance } from '../types/provenance'

describe('pickNextQuestion', () => {
  it('returns the first unanswered, not-yet-asked question', () => {
    const intake = createEmptyIntakeRecord()
    const q = pickNextQuestion(intake, new Set())
    expect(q?.id).toBe(INTAKE_QUESTIONS[0].id)
  })

  it('skips a field already captured from free text', () => {
    const intake = createEmptyIntakeRecord()
    intake.durationPattern = makeProvenance('Constant', 'patient_reported')
    const q = pickNextQuestion(intake, new Set())
    expect(q?.id).not.toBe('onset')
  })

  it('returns null once everything is answered', () => {
    const intake = createEmptyIntakeRecord()
    const askedIds = new Set(INTAKE_QUESTIONS.map((q) => q.id))
    expect(pickNextQuestion(intake, askedIds)).toBeNull()
    expect(isReadyForConfirmation(intake, askedIds)).toBe(true)
  })
})

describe('isQuestionAnswered — unknown must never look answered as a false "no"', () => {
  it('screeningSymptoms is NOT answered merely because some ids are set and others are not', () => {
    const intake = createEmptyIntakeRecord()
    intake.associatedSymptoms.chestPain = makeProvenance('denied', 'patient_reported')
    const question = INTAKE_QUESTIONS.find((q) => q.id === 'screeningSymptoms')!
    expect(isQuestionAnswered(question, intake)).toBe(false)
  })
})

describe('mergeIntake', () => {
  it('merges associatedSymptoms key-by-key without erasing previously known symptoms', () => {
    const base = createEmptyIntakeRecord()
    base.associatedSymptoms.fever = makeProvenance('denied', 'patient_reported')
    const merged = mergeIntake(base, { associatedSymptoms: { nausea: makeProvenance('reported', 'patient_reported') } })
    expect(merged.associatedSymptoms.fever?.value).toBe('denied')
    expect(merged.associatedSymptoms.nausea?.value).toBe('reported')
  })

  it('does not fabricate a "denied" for a symptom that was never mentioned in an update', () => {
    const base = createEmptyIntakeRecord()
    const merged = mergeIntake(base, { chiefComplaint: makeProvenance('headache', 'patient_reported') })
    expect(merged.associatedSymptoms.severeBreathingDifficulty).toBeUndefined()
  })
})
