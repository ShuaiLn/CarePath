import type { DataCompleteness } from './provenance'

/**
 * Minimal MVP facility card fields. See docs/CarePath_AI_Plan.md Section 6.
 * CMS quality data is intentionally NOT part of the default card shape —
 * it lives in `qualityDetails`, revealed only behind an explicit expand
 * action, and Google-sourced fields are kept clearly separate from
 * CMS-sourced fields rather than merged into one score.
 */
export interface FacilityCard {
  id: string
  name: string
  careType: CareTypeLabel
  distanceMiles: number
  openNow: boolean
  hoursSummary: string
  relevantServices: string[]
  /** Google-sourced patient rating, out of 5. Source: Google Places (or mock). */
  patientRating: number | null
  /** Internal-only ranking reasons. The composite score itself is never shown. */
  whyThisFits: string[]
  qualityDetails: FacilityQualityDetails | null
  costEstimate: CostEstimate
}

export type CareTypeLabel = 'Emergency Department' | 'Urgent Care' | 'Primary Care'

/** CMS Provider Data / Care Compare — kept clearly separate from Google data. */
export interface FacilityQualityDetails {
  source: 'CMS Provider Data Catalog (mock)'
  overallHospitalRatingStars: number | null
  edWaitTimeMinutesMedian: number | null
  readmissionRateCategory: 'better than national average' | 'no different than national average' | 'worse than national average' | 'not available'
}

export interface CostEstimate {
  lowUsd: number
  highUsd: number
  dataCompleteness: DataCompleteness
  source: 'CMS Hospital Price Transparency (mock)'
}
