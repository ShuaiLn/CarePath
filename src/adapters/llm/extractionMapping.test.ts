import { describe, it, expect } from 'vitest'
import { mapToIntake } from './extractionMapping'
import { makeProvenance } from '../../types/provenance'
import type { RawExtraction } from './extractionSchema'
import type { IntakeRecord } from '../../types/intake'

function withSourceText<T>(value: T, sourceText = 'evidence') {
  return { value, sourceText }
}

const emptyRaw: RawExtraction = {
  chiefComplaint: null,
  location: null,
  severity: null,
  trend: null,
  durationPattern: null,
  onsetHours: null,
  age: null,
  associatedSymptoms: null,
  medicalConditions: null,
  currentMedications: null,
  allergies: null,
  scopeFlags: null,
  clarification: null,
}

describe('mapToIntake', () => {
  it('wraps every populated value in a patient_reported provenance envelope', () => {
    const raw: RawExtraction = { ...emptyRaw, chiefComplaint: withSourceText('chest pain'), severity: withSourceText(8) }
    const out = mapToIntake(raw, {})
    expect(out.chiefComplaint?.value).toBe('chest pain')
    expect(out.chiefComplaint?.source).toBe('patient_reported')
    expect(out.chiefComplaint?.confirmedByUser).toBe(false)
    expect(out.severity?.value).toBe(8)
  })

  it('never lets this turn downgrade an already-reported associated symptom to denied', () => {
    const raw: RawExtraction = { ...emptyRaw, associatedSymptoms: { chestPain: withSourceText('denied') } }
    const existing: Partial<IntakeRecord> = { associatedSymptoms: { chestPain: makeProvenance('reported', 'patient_reported') } }
    const out = mapToIntake(raw, existing)
    expect(out.associatedSymptoms?.chestPain).toBeUndefined()
  })

  it('still allows a genuinely new "reported" symptom in the same turn a different one is denied', () => {
    const raw: RawExtraction = {
      ...emptyRaw,
      associatedSymptoms: { chestPain: withSourceText('denied'), fever: withSourceText('reported') },
    }
    const existing: Partial<IntakeRecord> = { associatedSymptoms: { chestPain: makeProvenance('reported', 'patient_reported') } }
    const out = mapToIntake(raw, existing)
    expect(out.associatedSymptoms?.chestPain).toBeUndefined()
    expect(out.associatedSymptoms?.fever?.value).toBe('reported')
  })

  it('never lets this turn downgrade an already-reported scope flag (e.g. mental health crisis) to denied', () => {
    const raw: RawExtraction = { ...emptyRaw, scopeFlags: { mentalHealthCrisis: withSourceText('denied') } }
    const existing: Partial<IntakeRecord> = { mentalHealthCrisisReported: makeProvenance('reported', 'patient_reported') }
    const out = mapToIntake(raw, existing)
    expect(out.mentalHealthCrisisReported).toBeUndefined()
  })

  it('allows upgrading from unknown to reported with no prior evidence required', () => {
    const raw: RawExtraction = { ...emptyRaw, associatedSymptoms: { chestPain: withSourceText('reported') } }
    const out = mapToIntake(raw, {})
    expect(out.associatedSymptoms?.chestPain?.value).toBe('reported')
  })

  it('"I don\'t have chest pain" -> chestPain denied maps through unchanged when there is no prior "reported"', () => {
    const raw: RawExtraction = { ...emptyRaw, associatedSymptoms: { chestPain: withSourceText('denied', "don't have chest pain") } }
    const out = mapToIntake(raw, {})
    expect(out.associatedSymptoms?.chestPain?.value).toBe('denied')
  })

  it('never introduces diagnostic speculation not present in the raw fields it was given', () => {
    const raw: RawExtraction = { ...emptyRaw, chiefComplaint: withSourceText('stomach pain', 'stomach pain') }
    const out = mapToIntake(raw, {})
    expect(JSON.stringify(out)).not.toMatch(/reflux/i)
  })
})
