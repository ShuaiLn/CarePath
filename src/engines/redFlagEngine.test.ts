import { describe, it, expect } from 'vitest'
import { checkCriticalRedFlags } from './redFlagEngine'
import { createEmptyIntakeRecord } from '../types/intake'
import { makeProvenance } from '../types/provenance'

describe('checkCriticalRedFlags', () => {
  it('does not trigger on an empty intake record', () => {
    const intake = createEmptyIntakeRecord()
    expect(checkCriticalRedFlags(intake).triggered).toBe(false)
  })

  it('triggers on severe breathing difficulty', () => {
    const intake = createEmptyIntakeRecord()
    intake.associatedSymptoms.severeBreathingDifficulty = makeProvenance('reported', 'patient_reported')
    const result = checkCriticalRedFlags(intake)
    expect(result.triggered).toBe(true)
    expect(result.matchedRules.map((r) => r.id)).toContain('severeBreathingDifficulty')
  })

  it('does NOT trigger when a symptom is merely unknown (not asked / not answered)', () => {
    const intake = createEmptyIntakeRecord()
    intake.associatedSymptoms.severeBreathingDifficulty = makeProvenance('unknown', 'patient_reported')
    intake.associatedSymptoms.chestPain = makeProvenance('unknown', 'patient_reported')
    expect(checkCriticalRedFlags(intake).triggered).toBe(false)
  })

  it('does NOT trigger when a symptom is explicitly denied', () => {
    const intake = createEmptyIntakeRecord()
    intake.associatedSymptoms.severeBreathingDifficulty = makeProvenance('denied', 'patient_reported')
    expect(checkCriticalRedFlags(intake).triggered).toBe(false)
  })

  it('triggers on chest pain plus a concerning modifier, but not chest pain alone', () => {
    const plainChestPain = createEmptyIntakeRecord()
    plainChestPain.associatedSymptoms.chestPain = makeProvenance('reported', 'patient_reported')
    plainChestPain.severity = makeProvenance(3, 'patient_reported')
    expect(checkCriticalRedFlags(plainChestPain).triggered).toBe(false)

    const concerning = createEmptyIntakeRecord()
    concerning.associatedSymptoms.chestPain = makeProvenance('reported', 'patient_reported')
    concerning.associatedSymptoms.radiatingPain = makeProvenance('reported', 'patient_reported')
    const result = checkCriticalRedFlags(concerning)
    expect(result.triggered).toBe(true)
    expect(result.matchedRules.map((r) => r.id)).toContain('concerningChestPain')
  })

  it('triggers on high-severity chest pain even without an explicit modifier symptom', () => {
    const intake = createEmptyIntakeRecord()
    intake.associatedSymptoms.chestPain = makeProvenance('reported', 'patient_reported')
    intake.severity = makeProvenance(9, 'patient_reported')
    expect(checkCriticalRedFlags(intake).triggered).toBe(true)
  })
})
