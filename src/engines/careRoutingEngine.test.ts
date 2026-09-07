import { describe, it, expect } from 'vitest'
import { routeCare, categorizeSymptom } from './careRoutingEngine'
import { assessCareLevel } from './careLevelEngine'
import { createEmptyIntakeRecord } from '../types/intake'
import { makeProvenance } from '../types/provenance'
import { insufficientInformation, outOfScope } from '../types/engineOutcomes'

function screenedIntake(chiefComplaint: string) {
  const intake = createEmptyIntakeRecord()
  intake.chiefComplaint = makeProvenance(chiefComplaint, 'patient_reported')
  intake.severity = makeProvenance(3, 'patient_reported')
  intake.durationPattern = makeProvenance('Intermittent', 'patient_reported')
  intake.trend = makeProvenance('stable', 'patient_reported')
  for (const id of ['fever', 'nausea', 'vomiting', 'severeBreathingDifficulty', 'chestPain', 'faintingOrLossOfConsciousness', 'severeBleeding'] as const) {
    intake.associatedSymptoms[id] = makeProvenance('denied', 'patient_reported')
  }
  return intake
}

describe('categorizeSymptom', () => {
  it('categorizes chest pain as chest_cardiac even without keyword text, based on structured symptom', () => {
    const intake = createEmptyIntakeRecord()
    intake.associatedSymptoms.chestPain = makeProvenance('reported', 'patient_reported')
    expect(categorizeSymptom(intake).category).toBe('chest_cardiac')
  })

  it('falls back to general_unclear when nothing matches', () => {
    const intake = createEmptyIntakeRecord()
    intake.chiefComplaint = makeProvenance('feeling generally unwell', 'patient_reported')
    expect(categorizeSymptom(intake).category).toBe('general_unclear')
  })
})

describe('routeCare', () => {
  it('surfaces "Emergency Department" as the care setting headline for chest pain red flags, never "Cardiology"', () => {
    const intake = screenedIntake('chest pain')
    intake.associatedSymptoms.chestPain = makeProvenance('reported', 'patient_reported')
    intake.associatedSymptoms.radiatingPain = makeProvenance('reported', 'patient_reported')

    const careLevel = assessCareLevel(intake)
    expect(careLevel.kind).toBe('RESULT')
    if (careLevel.kind !== 'RESULT') return

    const routing = routeCare(intake, careLevel)
    expect(routing.kind).toBe('RESULT')
    if (routing.kind === 'RESULT') {
      expect(routing.result.careSetting).toBe('Emergency Department')
      expect(routing.result.possibleDownstreamSpecialty).toMatch(/Cardiology/)
      expect(routing.result.possibleDownstreamSpecialty).toMatch(/later, depending on evaluation/)
    }
  })

  it('propagates INSUFFICIENT_INFORMATION without inventing a routing result', () => {
    const outcome = routeCare(createEmptyIntakeRecord(), insufficientInformation(['x']))
    expect(outcome.kind).toBe('INSUFFICIENT_INFORMATION')
  })

  it('propagates OUT_OF_SCOPE without inventing a routing result', () => {
    const outcome = routeCare(createEmptyIntakeRecord(), outOfScope('pregnancy'))
    expect(outcome.kind).toBe('OUT_OF_SCOPE')
  })

  it('routes a mild, stable abdominal complaint to self-care / primary care rather than urgent settings', () => {
    const intake = screenedIntake('stomach ache')
    const careLevel = assessCareLevel(intake)
    expect(careLevel.kind).toBe('RESULT')
    if (careLevel.kind !== 'RESULT') return
    const routing = routeCare(intake, careLevel)
    expect(routing.kind).toBe('RESULT')
    if (routing.kind === 'RESULT') {
      expect(routing.result.careSetting).toBe('Self-care')
      expect(routing.result.possibleDownstreamSpecialty).toMatch(/Gastroenterology/)
    }
  })
})
