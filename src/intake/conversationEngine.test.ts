import { describe, it, expect } from 'vitest'
import { isQuestionAnswered, pickNextQuestion, isReadyForConfirmation, mergeIntake, selectRelevantContext } from './conversationEngine'
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

describe('selectRelevantContext — data minimization for the LLM extraction backend', () => {
  it('sends nothing extra for a self-contained question like severity', () => {
    const intake = createEmptyIntakeRecord()
    intake.allergies = makeProvenance(['penicillin'], 'patient_reported')
    intake.medicalConditions = makeProvenance(['diabetes'], 'patient_reported')
    expect(selectRelevantContext('severity', intake)).toEqual({})
  })

  it('sends nothing extra for the initial free-text question', () => {
    const intake = createEmptyIntakeRecord()
    intake.chiefComplaint = makeProvenance('headache', 'patient_reported')
    expect(selectRelevantContext('initial', intake)).toEqual({})
  })

  it('includes only the already-known critical screening symptoms for the screeningSymptoms question — nothing else leaks', () => {
    const intake = createEmptyIntakeRecord()
    intake.associatedSymptoms.chestPain = makeProvenance('reported', 'patient_reported')
    intake.allergies = makeProvenance(['penicillin'], 'patient_reported')
    intake.medicalConditions = makeProvenance(['diabetes'], 'patient_reported')

    const context = selectRelevantContext('screeningSymptoms', intake)

    expect(context.associatedSymptoms?.chestPain?.value).toBe('reported')
    expect(context.allergies).toBeUndefined()
    expect(context.medicalConditions).toBeUndefined()
    expect(Object.keys(context)).toEqual(['associatedSymptoms'])
  })

  it('returns no associatedSymptoms key at all when nothing is known yet, for screeningSymptoms', () => {
    const intake = createEmptyIntakeRecord()
    expect(selectRelevantContext('screeningSymptoms', intake)).toEqual({})
  })

  it('includes both critical and secondary screening symptoms already known for moreScreeningSymptoms', () => {
    const intake = createEmptyIntakeRecord()
    intake.associatedSymptoms.chestPain = makeProvenance('denied', 'patient_reported')
    intake.associatedSymptoms.fever = makeProvenance('reported', 'patient_reported')
    const context = selectRelevantContext('moreScreeningSymptoms', intake)
    expect(context.associatedSymptoms?.chestPain?.value).toBe('denied')
    expect(context.associatedSymptoms?.fever?.value).toBe('reported')
  })

  it('includes only already-known scope flags for scopeCheck, never unrelated fields', () => {
    const intake = createEmptyIntakeRecord()
    intake.traumaInjuryReported = makeProvenance('reported', 'patient_reported')
    intake.currentMedications = makeProvenance(['ibuprofen'], 'patient_reported')

    const context = selectRelevantContext('scopeCheck', intake)

    expect(context.traumaInjuryReported?.value).toBe('reported')
    expect(context.currentMedications).toBeUndefined()
    expect(context.postOperativeComplicationReported).toBeUndefined()
  })
})
