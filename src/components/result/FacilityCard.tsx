import { useState } from 'react'
import type { FacilityCard as FacilityCardType } from '../../types/facility'
import { Card } from '../ui/Card'

const COMPLETENESS_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' }

export function FacilityCardView({ facility }: { facility: FacilityCardType }) {
  const [showQuality, setShowQuality] = useState(false)

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{facility.name}</div>
          <div className="text-xs text-slate-500">
            {facility.careType} · {facility.distanceMiles} mi · {facility.hoursSummary}
          </div>
        </div>
        {facility.patientRating !== null && (
          <div className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
            ★ {facility.patientRating.toFixed(1)}
            <span className="ml-1 text-slate-400">(Google)</span>
          </div>
        )}
      </div>

      {facility.relevantServices.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {facility.relevantServices.map((s) => (
            <span key={s} className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs text-slate-500">
        <div className="mb-1 font-medium text-slate-600">Why this location may fit</div>
        <ul className="list-disc space-y-0.5 pl-4">
          {facility.whyThisFits.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Estimated self-pay visit range: <strong>${facility.costEstimate.lowUsd}–${facility.costEstimate.highUsd}</strong>
        <span className="ml-1 text-slate-400">
          (data confidence: {COMPLETENESS_LABEL[facility.costEstimate.dataCompleteness]})
        </span>
        <div className="mt-1 text-slate-400">Uninsured or self-pay? Ask the provider for a Good Faith Estimate.</div>
      </div>

      <button
        type="button"
        onClick={() => setShowQuality((v) => !v)}
        className="mt-3 text-xs font-medium text-teal-700 underline underline-offset-2"
      >
        {showQuality ? 'Hide quality details' : 'View quality details'}
      </button>
      {showQuality && (
        <div className="mt-2 rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600">
          <div className="mb-1 text-slate-400">Source: {facility.qualityDetails?.source ?? 'Not available'}</div>
          {facility.qualityDetails?.overallHospitalRatingStars != null && (
            <div>Overall hospital rating: {facility.qualityDetails.overallHospitalRatingStars} / 5 (CMS)</div>
          )}
          {facility.qualityDetails?.edWaitTimeMinutesMedian != null && (
            <div>Median ED wait time: ~{facility.qualityDetails.edWaitTimeMinutesMedian} min</div>
          )}
          <div>Readmission rate: {facility.qualityDetails?.readmissionRateCategory ?? 'not available'}</div>
        </div>
      )}
    </Card>
  )
}
