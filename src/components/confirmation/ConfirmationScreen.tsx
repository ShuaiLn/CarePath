import { useState } from 'react'
import type { IntakeRecord, AssociatedSymptomId } from '../../types/intake'
import { ASSOCIATED_SYMPTOM_IDS, ASSOCIATED_SYMPTOM_LABELS } from '../../types/intake'
import type { ReportStatus } from '../../types/provenance'
import { makeProvenance, confirmProvenance } from '../../types/provenance'
import { Card } from '../ui/Card'
import { Banner } from '../ui/Banner'
import { TriStateToggle } from './TriStateToggle'

interface ConfirmationScreenProps {
  intake: IntakeRecord
  onConfirm: (finalIntake: IntakeRecord) => void
}

const SCOPE_FLAGS: { key: keyof IntakeRecord; label: string }[] = [
  { key: 'isPregnantOrPossiblyPregnant', label: 'Pregnant, or possibly pregnant' },
  { key: 'mentalHealthCrisisReported', label: 'Mental health crisis / thoughts of self-harm' },
  { key: 'poisoningExposureReported', label: 'Possible poisoning or overdose' },
  { key: 'traumaInjuryReported', label: 'Related to a significant injury/accident' },
  { key: 'sexualHealthConcernReported', label: 'Sexual health concern' },
  { key: 'postOperativeComplicationReported', label: 'Possible complication from a recent surgery/procedure' },
  { key: 'immunocompromisedReported', label: 'Weakened immune system' },
]

function statusOf(intake: IntakeRecord, key: keyof IntakeRecord): ReportStatus {
  const field = intake[key] as { value: ReportStatus } | undefined
  return field?.value ?? 'unknown'
}

export function ConfirmationScreen({ intake, onConfirm }: ConfirmationScreenProps) {
  const [draft, setDraft] = useState<IntakeRecord>(intake)

  function setText(key: keyof IntakeRecord, value: string) {
    setDraft((prev) => ({ ...prev, [key]: makeProvenance(value, 'patient_reported') }))
  }

  function setNumber(key: 'severity' | 'age', value: string) {
    const n = value === '' ? undefined : Number(value)
    setDraft((prev) => ({ ...prev, [key]: n === undefined || Number.isNaN(n) ? prev[key] : makeProvenance(n, 'patient_reported') }))
  }

  function setList(key: 'medicalConditions' | 'currentMedications' | 'allergies', value: string) {
    const list = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    setDraft((prev) => ({ ...prev, [key]: makeProvenance(list, 'patient_reported') }))
  }

  function setSymptomStatus(id: AssociatedSymptomId, status: ReportStatus) {
    setDraft((prev) => ({
      ...prev,
      associatedSymptoms: { ...prev.associatedSymptoms, [id]: makeProvenance(status, 'patient_reported') },
    }))
  }

  function setScopeFlagStatus(key: keyof IntakeRecord, status: ReportStatus) {
    setDraft((prev) => ({ ...prev, [key]: makeProvenance(status, 'patient_reported') }))
  }

  function handleConfirm() {
    const final: IntakeRecord = { ...draft, associatedSymptoms: { ...draft.associatedSymptoms } }
    for (const key of Object.keys(final) as (keyof IntakeRecord)[]) {
      if (key === 'associatedSymptoms') continue
      const field = final[key] as { value: unknown; confirmedByUser: boolean } | undefined
      if (field) (final as unknown as Record<string, unknown>)[key] = confirmProvenance(field as never)
    }
    for (const id of Object.keys(final.associatedSymptoms) as AssociatedSymptomId[]) {
      const field = final.associatedSymptoms[id]
      if (field) final.associatedSymptoms[id] = confirmProvenance(field)
    }
    onConfirm(final)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Banner tone="info">
        <strong>Here's what I understood.</strong> Please review and correct anything that's wrong before we continue —
        an AI misunderstanding is not a medical fact.
      </Banner>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">The basics</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">What's bothering you</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={draft.chiefComplaint?.value ?? ''}
              onChange={(e) => setText('chiefComplaint', e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Location</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={draft.location?.value ?? ''}
              onChange={(e) => setText('location', e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Severity (0-10)</span>
            <input
              type="number"
              min={0}
              max={10}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={draft.severity?.value ?? ''}
              onChange={(e) => setNumber('severity', e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Trend</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={draft.trend?.value ?? ''}
              onChange={(e) => setText('trend', e.target.value)}
            >
              <option value="">Not provided</option>
              <option value="improving">Improving</option>
              <option value="stable">Stable</option>
              <option value="worsening">Worsening</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Duration pattern</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={draft.durationPattern?.value ?? ''}
              onChange={(e) => setText('durationPattern', e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Age</span>
            <input
              type="number"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={draft.age?.value ?? ''}
              onChange={(e) => setNumber('age', e.target.value)}
            />
          </label>
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-slate-500 uppercase tracking-wide">Warning symptoms</h3>
        <div className="divide-y divide-slate-100">
          {ASSOCIATED_SYMPTOM_IDS.map((id) => (
            <TriStateToggle
              key={id}
              label={ASSOCIATED_SYMPTOM_LABELS[id]}
              value={draft.associatedSymptoms[id]?.value ?? 'unknown'}
              onChange={(v) => setSymptomStatus(id, v)}
            />
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-slate-500 uppercase tracking-wide">Screening questions</h3>
        <div className="divide-y divide-slate-100">
          {SCOPE_FLAGS.map(({ key, label }) => (
            <TriStateToggle key={key} label={label} value={statusOf(draft, key)} onChange={(v) => setScopeFlagStatus(key, v)} />
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">Relevant context</h3>
        <div className="grid grid-cols-1 gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Medical conditions (comma separated, or "none")</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={draft.medicalConditions?.value?.join(', ') ?? ''}
              onChange={(e) => setList('medicalConditions', e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Current medications</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={draft.currentMedications?.value?.join(', ') ?? ''}
              onChange={(e) => setList('currentMedications', e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Allergies</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={draft.allergies?.value?.join(', ') ?? ''}
              onChange={(e) => setList('allergies', e.target.value)}
            />
          </label>
        </div>
      </Card>

      <button
        type="button"
        onClick={handleConfirm}
        className="w-full rounded-full bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-teal-800"
      >
        This looks right — continue
      </button>
    </div>
  )
}
