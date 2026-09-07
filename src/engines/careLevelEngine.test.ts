import { describe, it, expect } from 'vitest'
import { assessCareLevel } from './careLevelEngine'
import { createEmptyIntakeRecord } from '../types/intake'
import { makeProvenance } from '../types/provenance'

function baselineScreenedIntake() {
  const intake = createEmptyIntakeRecord()
  intake.chiefComplaint = makeProvenance('Abdominal pain', 'patient_reported')
  intake.severity = makeProvenance(3, 'patient_reported')
  intake.durationPattern = makeProvenance('Intermittent', 'patient_reported')
  intake.trend = makeProvenance('stable', 'patient_reported')
  for (const id of ['fever', 'nausea', 'vomiting', 'severeBreathingDifficulty', 'chestPain', 'faintingOrLossOfConsciousness', 'severeBleeding'] as const) {
    intake.associatedSymptoms[id] = makeProvenance('denied', 'patient_reported')
  }
  return intake
}

describe('assessCareLevel', () => {
  it('returns INSUFFICIENT_INFORMATION when required fields are missing', () => {
    const intake = createEmptyIntakeRecord()
    intake.chiefComplaint = makeProvenance('Something feels off', 'patient_reported')
    const outcome = assessCareLevel(intake)
    expect(outcome.kind).toBe('INSUFFICIENT_INFORMATION')
  })

  it('returns INSUFFICIENT_INFORMATION when no screening symptoms were ever asked about, even if core fields are present', () => {
    const intake = createEmptyIntakeRecord()
    intake.chiefComplaint = makeProvenance('Abdominal pain', 'patient_reported')
    intake.severity = makeProvenance(4, 'patient_reported')
    intake.durationPattern = makeProvenance('Constant', 'patient_reported')
    const outcome = assessCareLevel(intake)
    expect(outcome.kind).toBe('INSUFFICIENT_INFORMATION')
  })

  it('produces a normal categorical tier once required fields and screening are present', () => {
    const outcome = assessCareLevel(baselineScreenedIntake())
    expect(outcome.kind).toBe('RESULT')
    if (outcome.kind === 'RESULT') {
      expect(outcome.result.tier).toBe('SELF_CARE')
      expect(outcome.result.redFlagOverride).toBe(false)
    }
  })

  it('critical red flags override normal scoring even when the weighted score would be low', () => {
    const intake = baselineScreenedIntake()
    // Low severity, short/benign presentation that would otherwise score SELF_CARE...
    intake.severity = makeProvenance(2, 'patient_reported')
    intake.trend = makeProvenance('improving', 'patient_reported')
    // ...but a critical red flag is reported.
    intake.associatedSymptoms.severeBreathingDifficulty = makeProvenance('reported', 'patient_reported')

    const outcome = assessCareLevel(intake)
    expect(outcome.kind).toBe('RESULT')
    if (outcome.kind === 'RESULT') {
      expect(outcome.result.tier).toBe('EMERGENCY')
      expect(outcome.result.redFlagOverride).toBe(true)
      expect(outcome.result.triggeredRedFlags.length).toBeGreaterThan(0)
    }
  })

  it('returns OUT_OF_SCOPE for pregnancy rather than scoring it generically', () => {
    const intake = baselineScreenedIntake()
    intake.isPregnantOrPossiblyPregnant = makeProvenance('reported', 'patient_reported')
    const outcome = assessCareLevel(intake)
    expect(outcome.kind).toBe('OUT_OF_SCOPE')
    if (outcome.kind === 'OUT_OF_SCOPE') {
      expect(outcome.category).toBe('pregnancy')
    }
  })

  it('returns OUT_OF_SCOPE for pediatric patients based on age', () => {
    const intake = baselineScreenedIntake()
    intake.age = makeProvenance(10, 'patient_reported')
    const outcome = assessCareLevel(intake)
    expect(outcome.kind).toBe('OUT_OF_SCOPE')
    if (outcome.kind === 'OUT_OF_SCOPE') {
      expect(outcome.category).toBe('pediatric')
    }
  })

  it('a critical red flag still overrides even for an otherwise out-of-scope case (safety wins)', () => {
    const intake = baselineScreenedIntake()
    intake.isPregnantOrPossiblyPregnant = makeProvenance('reported', 'patient_reported')
    intake.associatedSymptoms.severeBreathingDifficulty = makeProvenance('reported', 'patient_reported')
    const outcome = assessCareLevel(intake)
    expect(outcome.kind).toBe('RESULT')
    if (outcome.kind === 'RESULT') {
      expect(outcome.result.tier).toBe('EMERGENCY')
    }
  })

  it('increases tier with worsening trend and higher severity', () => {
    const intake = baselineScreenedIntake()
    intake.severity = makeProvenance(8, 'patient_reported')
    intake.trend = makeProvenance('worsening', 'patient_reported')
    const outcome = assessCareLevel(intake)
    expect(outcome.kind).toBe('RESULT')
    if (outcome.kind === 'RESULT') {
      expect(['SAME_DAY_URGENT', 'EMERGENCY']).toContain(outcome.result.tier)
    }
  })

  it('never exposes a numeric score as part of anything meant for display copy (structural check)', () => {
    const outcome = assessCareLevel(baselineScreenedIntake())
    expect(outcome.kind).toBe('RESULT')
    if (outcome.kind === 'RESULT') {
      // internalScore exists for record-keeping, but factors (the only
      // display-oriented field) must not contain the raw number.
      const serializedFactors = JSON.stringify(outcome.result.factors)
      expect(serializedFactors).not.toMatch(/internalScore/)
    }
  })
})
