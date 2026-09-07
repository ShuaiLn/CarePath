import type { FacilityQualityDetails, CostEstimate, CareTypeLabel } from '../../types/facility'

/**
 * CMS Provider Data Catalog / Hospital Price Transparency adapter
 * interface. See docs/CarePath_AI_Plan.md Section 6. Kept as a separate
 * adapter from Google Places on purpose — these sources measure different
 * things (institutional quality/pricing vs. patient experience) and must
 * never be merged into one number.
 */
export interface CmsAdapter {
  readonly name: string
  getQualityDetails(facilityName: string, careType: CareTypeLabel): Promise<FacilityQualityDetails>
  getCostEstimate(category: string, careType: CareTypeLabel): Promise<CostEstimate>
}
