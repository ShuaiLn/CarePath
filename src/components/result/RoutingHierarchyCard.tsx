import type { CareRoutingResult } from '../../types/careRouting'
import { Card } from '../ui/Card'

/**
 * Always renders the three-level hierarchy in order (care setting, best
 * starting provider, downstream specialty) per docs/CarePath_AI_Plan.md
 * Section 5 — a specialty name never appears as the headline.
 */
export function RoutingHierarchyCard({ routing }: { routing: CareRoutingResult }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">Where to go</h3>
      <div className="space-y-3">
        <div>
          <div className="text-xs font-medium text-slate-400">Care setting</div>
          <div className="text-xl font-bold text-slate-900">{routing.careSetting}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-400">Best starting point</div>
          <div className="text-base text-slate-800">{routing.bestStartingProvider}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-400">Possible downstream specialty</div>
          <div className="text-base text-slate-600">{routing.possibleDownstreamSpecialty}</div>
        </div>
        <div className="border-t border-slate-100 pt-3 text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-700">Why: </span>
            {routing.why}
          </p>
          <p className="mt-1">
            <span className="font-medium text-slate-700">Timeframe: </span>
            {routing.urgencyTimeframe}
          </p>
        </div>
      </div>
    </Card>
  )
}
