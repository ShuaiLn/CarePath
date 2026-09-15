import { SCOPE_FLAG_IDS } from './types'
import type { RawExtraction } from './extractionSchema'
import { ASSOCIATED_SYMPTOM_IDS } from '../../types/intake'
import type { AssociatedSymptoms, IntakeRecord } from '../../types/intake'
import { makeProvenance } from '../../types/provenance'

/**
 * Maps validated-but-still-untrusted model output onto Partial<IntakeRecord>,
 * wrapping every value in a provenance envelope (source: 'patient_reported'),
 * exactly as MockLlmAdapter does.
 *
 * Guards, applied uniformly to every reported/denied/unknown field: this
 * turn's extraction is never allowed to downgrade a field the patient
 * already explicitly *reported* to *denied* — an unmentioned or ambiguous
 * symptom must never silently become denied (a blanket "no" later in the
 * conversation should not be read as retracting an earlier positive red
 * flag). Upgrading toward "reported" is always allowed; only the
 * safety-relevant softening direction is blocked.
 */

export const SCOPE_FLAG_TO_INTAKE_KEY: Record<(typeof SCOPE_FLAG_IDS)[number], keyof IntakeRecord> = {
  pregnancy: 'isPregnantOrPossiblyPregnant',
  mentalHealthCrisis: 'mentalHealthCrisisReported',
  poisoning: 'poisoningExposureReported',
  trauma: 'traumaInjuryReported',
  sexualHealth: 'sexualHealthConcernReported',
  postOperative: 'postOperativeComplicationReported',
  immunocompromised: 'immunocompromisedReported',
}

function existingValue(existing: Partial<IntakeRecord>, key: keyof IntakeRecord): unknown {
  const entry = existing[key] as { value?: unknown } | undefined
  return entry?.value
}

export function mapToIntake(raw: RawExtraction, existing: Partial<IntakeRecord>): Partial<IntakeRecord> {
  const out: Partial<IntakeRecord> = {}

  if (raw.chiefComplaint) out.chiefComplaint = makeProvenance(raw.chiefComplaint.value, 'patient_reported')
  if (raw.location) out.location = makeProvenance(raw.location.value, 'patient_reported')
  if (raw.severity) out.severity = makeProvenance(raw.severity.value, 'patient_reported')
  if (raw.trend) out.trend = makeProvenance(raw.trend.value, 'patient_reported')
  if (raw.durationPattern) out.durationPattern = makeProvenance(raw.durationPattern.value, 'patient_reported')
  if (raw.onsetHours) out.onsetHours = makeProvenance(raw.onsetHours.value, 'patient_reported')
  if (raw.age) out.age = makeProvenance(raw.age.value, 'patient_reported')
  if (raw.medicalConditions) out.medicalConditions = makeProvenance(raw.medicalConditions.value, 'patient_reported')
  if (raw.currentMedications) out.currentMedications = makeProvenance(raw.currentMedications.value, 'patient_reported')
  if (raw.allergies) out.allergies = makeProvenance(raw.allergies.value, 'patient_reported')

  if (raw.associatedSymptoms) {
    const merged: AssociatedSymptoms = {}
    for (const id of ASSOCIATED_SYMPTOM_IDS) {
      const field = raw.associatedSymptoms[id]
      if (!field) continue
      const existingStatus = existing.associatedSymptoms?.[id]?.value
      if (existingStatus === 'reported' && field.value === 'denied') continue
      merged[id] = makeProvenance(field.value, 'patient_reported')
    }
    if (Object.keys(merged).length > 0) out.associatedSymptoms = merged
  }

  if (raw.scopeFlags) {
    for (const flagId of SCOPE_FLAG_IDS) {
      const field = raw.scopeFlags[flagId]
      if (!field) continue
      const intakeKey = SCOPE_FLAG_TO_INTAKE_KEY[flagId]
      const existingStatus = existingValue(existing, intakeKey)
      if (existingStatus === 'reported' && field.value === 'denied') continue
      ;(out as Record<string, unknown>)[intakeKey] = makeProvenance(field.value, 'patient_reported')
    }
  }

  return out
}
