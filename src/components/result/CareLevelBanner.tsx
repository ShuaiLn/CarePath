import type { EngineOutcome } from '../../types/engineOutcomes'
import type { CareLevelResult } from '../../types/careLevel'
import { CARE_LEVEL_LABELS, CARE_LEVEL_ICON } from '../../types/careLevel'
import { Banner } from '../ui/Banner'

/**
 * Displays only the categorical care level — never the internal 0-100
 * score (docs/CarePath_AI_Plan.md Section 4). For EMERGENCY, per the
 * Emergency-case UX rule, this is the only thing shown; the caller is
 * responsible for skipping cost/rating comparisons in that case.
 */
export function CareLevelBanner({
  outcome,
  explanation,
}: {
  outcome: EngineOutcome<CareLevelResult>
  explanation: string | null
}) {
  if (outcome.kind === 'INSUFFICIENT_INFORMATION') {
    return (
      <Banner tone="warning">
        <strong>I don't have enough information to recommend a care setting safely.</strong>
        <p className="mt-1">{outcome.message}</p>
      </Banner>
    )
  }

  if (outcome.kind === 'OUT_OF_SCOPE') {
    return (
      <Banner tone="danger">
        <strong>This is outside what CarePath AI can safely assess.</strong>
        <p className="mt-1">{outcome.message}</p>
      </Banner>
    )
  }

  const { tier, redFlagOverride } = outcome.result
  if (tier === 'EMERGENCY') {
    return (
      <Banner tone="danger">
        <div className="text-lg font-bold">{CARE_LEVEL_ICON.EMERGENCY} Seek emergency care now.</div>
        {redFlagOverride && (
          <p className="mt-1">
            Based on what you reported ({outcome.result.triggeredRedFlags.join(', ')}), this needs immediate evaluation.
          </p>
        )}
        <p className="mt-2 text-sm">If symptoms are getting rapidly worse, call 911 or go to the nearest Emergency Department.</p>
      </Banner>
    )
  }

  return (
    <Banner tone={tier === 'SAME_DAY_URGENT' ? 'warning' : 'info'}>
      <div className="text-lg font-bold">
        {CARE_LEVEL_ICON[tier]} {CARE_LEVEL_LABELS[tier]}
      </div>
      {explanation && <p className="mt-2 text-sm">{explanation}</p>}
    </Banner>
  )
}
