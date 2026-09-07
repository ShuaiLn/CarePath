/**
 * Care-level categories shown to the user. See docs/CarePath_AI_Plan.md
 * Section 4. The internal 0-100 urgency score is never shown in the UI —
 * only these categorical tiers are.
 */
export type CareLevelTier =
  | 'EMERGENCY'
  | 'SAME_DAY_URGENT'
  | 'SCHEDULE_SOON'
  | 'SELF_CARE'

export const CARE_LEVEL_LABELS: Record<CareLevelTier, string> = {
  EMERGENCY: 'Emergency care now',
  SAME_DAY_URGENT: 'Same-day urgent evaluation',
  SCHEDULE_SOON: 'Schedule medical care soon',
  SELF_CARE: 'Self-care & monitor, with escalation guidance',
}

export const CARE_LEVEL_ICON: Record<CareLevelTier, string> = {
  EMERGENCY: '🔴',
  SAME_DAY_URGENT: '🟠',
  SCHEDULE_SOON: '🟡',
  SELF_CARE: '🟢',
}

export interface CareLevelFactor {
  id: string
  label: string
  /** Plain-language reason, never a numeric weight or score. */
  detail: string
}

export interface CareLevelResult {
  tier: CareLevelTier
  /** True only when a deterministic Critical Red-Flag Override fired. */
  redFlagOverride: boolean
  triggeredRedFlags: string[]
  /**
   * Human-readable factors driving the result, for plain-language
   * explanation only. The internal numeric score is intentionally NOT part
   * of this public result shape — see internalScore below, which exists
   * purely for local record-keeping and must never be rendered in the UI.
   */
  factors: CareLevelFactor[]
  /** Never display this in the UI. Kept only for internal record-keeping. */
  internalScore: number
}
