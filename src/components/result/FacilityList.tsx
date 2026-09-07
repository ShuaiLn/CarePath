import { useEffect, useState } from 'react'
import type { CareRoutingResult, CareSetting } from '../../types/careRouting'
import type { FacilityCard, CareTypeLabel } from '../../types/facility'
import { getPlacesAdapter } from '../../adapters/places'
import { FacilityCardView } from './FacilityCard'

function toCareTypeLabel(careSetting: CareSetting): CareTypeLabel {
  switch (careSetting) {
    case 'Emergency Department':
      return 'Emergency Department'
    case 'Urgent Care':
      return 'Urgent Care'
    case 'Primary care soon':
    case 'Self-care':
      return 'Primary Care'
  }
}

/**
 * Facility search — docs/CarePath_AI_Plan.md Section 6. Only rendered for
 * non-emergency, in-scope results; per the Emergency-case UX rule,
 * facility/cost comparisons are never shown alongside "Seek emergency care
 * now."
 */
export function FacilityList({ routing }: { routing: CareRoutingResult }) {
  const [facilities, setFacilities] = useState<FacilityCard[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setFacilities(null)
    getPlacesAdapter()
      .searchFacilities({ careType: toCareTypeLabel(routing.careSetting), category: routing.category })
      .then((results) => {
        if (!cancelled) setFacilities(results)
      })
    return () => {
      cancelled = true
    }
  }, [routing.careSetting, routing.category])

  if (routing.careSetting === 'Self-care') {
    return null
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-500 uppercase tracking-wide">Nearby options</h3>
      {!facilities && <p className="text-sm text-slate-400">Loading nearby facilities…</p>}
      <div className="space-y-3">
        {facilities?.map((f) => (
          <FacilityCardView key={f.id} facility={f} />
        ))}
      </div>
    </div>
  )
}
