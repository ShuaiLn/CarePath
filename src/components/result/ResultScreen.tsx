import type { EngineOutcome } from '../../types/engineOutcomes'
import type { CareLevelResult } from '../../types/careLevel'
import type { CareRoutingResult } from '../../types/careRouting'
import { CareLevelBanner } from './CareLevelBanner'
import { RoutingHierarchyCard } from './RoutingHierarchyCard'
import { FacilityList } from './FacilityList'

interface ResultScreenProps {
  careLevel: EngineOutcome<CareLevelResult>
  careRouting: EngineOutcome<CareRoutingResult> | null
  careLevelExplanation: string | null
  onPrepareForVisit: () => void
}

export function ResultScreen({ careLevel, careRouting, careLevelExplanation, onPrepareForVisit }: ResultScreenProps) {
  const isEmergency = careLevel.kind === 'RESULT' && careLevel.result.tier === 'EMERGENCY'
  const routingResult = careRouting?.kind === 'RESULT' ? careRouting.result : null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <CareLevelBanner outcome={careLevel} explanation={careLevelExplanation} />

      {!isEmergency && routingResult && <RoutingHierarchyCard routing={routingResult} />}

      {!isEmergency && routingResult && <FacilityList routing={routingResult} />}

      <button
        type="button"
        onClick={onPrepareForVisit}
        className="w-full rounded-full bg-slate-800 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-slate-900"
      >
        Prepare for My Visit →
      </button>
    </div>
  )
}
