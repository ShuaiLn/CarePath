import { describe, it, expect } from 'vitest'
import { generateVisitSummary, TOP_BANNER_DISCLAIMER } from './visitSummaryGenerator'
import { createEmptyIntakeRecord } from '../types/intake'
import { makeProvenance } from '../types/provenance'
import { assessCareLevel } from '../engines/careLevelEngine'
import { routeCare } from '../engines/careRoutingEngine'

function screenedIntake() {
  const intake = createEmptyIntakeRecord()
  intake.chiefComplaint = makeProvenance('Lower-right abdominal pain', 'patient_reported')
  intake.severity = makeProvenance(6, 'patient_reported')
  intake.durationPattern = makeProvenance('Continuous', 'patient_reported')
  intake.onsetDescription = makeProvenance('3 days ago', 'patient_reported')
  intake.trend = makeProvenance('worsening', 'patient_reported')
  intake.medicalConditions = makeProvenance(['Diabetes'], 'patient_reported')
  intake.currentMedications = makeProvenance(['Metformin'], 'patient_reported')
  intake.allergies = makeProvenance(['Penicillin'], 'patient_reported')
  intake.associatedSymptoms.nausea = makeProvenance('reported', 'patient_reported')
  intake.associatedSymptoms.vomiting = makeProvenance('denied', 'patient_reported')
  intake.associatedSymptoms.fever = makeProvenance('denied', 'patient_reported')
  intake.associatedSymptoms.chestPain = makeProvenance('denied', 'patient_reported')
  intake.associatedSymptoms.severeBreathingDifficulty = makeProvenance('denied', 'patient_reported')
  intake.associatedSymptoms.faintingOrLossOfConsciousness = makeProvenance('denied', 'patient_reported')
  intake.associatedSymptoms.severeBleeding = makeProvenance('denied', 'patient_reported')
  // bloodInStoolOrVomit intentionally left unanswered (unknown)
  return intake
}

describe('generateVisitSummary', () => {
  it('carries the mandatory top-of-page disclaimer', () => {
    const intake = screenedIntake()
    const careLevel = assessCareLevel(intake)
    const routing = routeCare(intake, careLevel)
    const summary = generateVisitSummary(intake, careLevel, routing)
    expect(summary.disclaimer).toBe(TOP_BANNER_DISCLAIMER)
  })

  it('renders unanswered fields as "Not provided" (null) rather than inventing an answer', () => {
    const intake = createEmptyIntakeRecord()
    intake.chiefComplaint = makeProvenance('Headache', 'patient_reported')
    const careLevel = assessCareLevel(intake)
    const routing = routeCare(intake, careLevel)
    const summary = generateVisitSummary(intake, careLevel, routing)
    expect(summary.whyImSeekingCare.severity).toBeNull()
    expect(summary.relevantContext.recentEvents).toBeNull()
  })

  it('never places an unasked/unknown symptom into the Denied list (unknown must not become a false "no")', () => {
    const intake = screenedIntake()
    const careLevel = assessCareLevel(intake)
    const routing = routeCare(intake, careLevel)
    const summary = generateVisitSummary(intake, careLevel, routing)

    const deniedIds = summary.otherSymptomsIReported.denied.map((l) => l.id)
    const unknownIds = summary.otherSymptomsIReported.unknown.map((l) => l.id)

    expect(deniedIds).not.toContain('bloodInStoolOrVomit')
    expect(unknownIds).toContain('bloodInStoolOrVomit')
  })

  it('puts explicitly reported symptoms in Reported and explicitly denied ones in Denied', () => {
    const intake = screenedIntake()
    const careLevel = assessCareLevel(intake)
    const routing = routeCare(intake, careLevel)
    const summary = generateVisitSummary(intake, careLevel, routing)

    expect(summary.otherSymptomsIReported.reported.map((l) => l.id)).toContain('nausea')
    expect(summary.otherSymptomsIReported.denied.map((l) => l.id)).toContain('vomiting')
  })

  it('keeps the CarePath navigation result in its own section, separate from patient-reported facts', () => {
    const intake = screenedIntake()
    const careLevel = assessCareLevel(intake)
    const routing = routeCare(intake, careLevel)
    const summary = generateVisitSummary(intake, careLevel, routing)

    expect(summary.carePathNavigationResult.disclaimer).toMatch(/not a diagnosis/i)
    expect(summary.carePathNavigationResult.careLevelLabel).toBeTruthy()
  })

  it('generates doctor questions from information gaps only, never diagnostic/suspected-condition phrasing', () => {
    const intake = screenedIntake()
    const careLevel = assessCareLevel(intake)
    const routing = routeCare(intake, careLevel)
    const summary = generateVisitSummary(intake, careLevel, routing)

    for (const q of summary.questionsForMyDoctor) {
      expect(q.toLowerCase()).not.toMatch(/could this be|is this|diagnos/)
    }
    expect(summary.questionsForMyDoctor.some((q) => /tests/i.test(q))).toBe(true)
  })

  it('reflects an INSUFFICIENT_INFORMATION care-level outcome without fabricating a tier', () => {
    const intake = createEmptyIntakeRecord()
    intake.chiefComplaint = makeProvenance('Not feeling well', 'patient_reported')
    const careLevel = assessCareLevel(intake)
    const routing = routeCare(intake, careLevel)
    const summary = generateVisitSummary(intake, careLevel, routing)
    expect(summary.carePathNavigationResult.careLevelTier).toBe('INSUFFICIENT_INFORMATION')
    expect(summary.carePathNavigationResult.routing).toBeNull()
  })
})
