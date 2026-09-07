import type { FacilityCard, CareTypeLabel } from '../../types/facility'

export interface FacilitySearchQuery {
  careType: CareTypeLabel
  category: string
}

/**
 * Google Places adapter interface. See docs/CarePath_AI_Plan.md Section 6
 * and Section 12 — Google Maps API credentials must never live
 * client-side; a real implementation would call a backend proxy. Only
 * Google-sourced fields (rating, hours, distance) belong behind this
 * adapter; CMS-sourced quality data is a separate adapter (see ../cms).
 */
export interface PlacesAdapter {
  readonly name: string
  searchFacilities(query: FacilitySearchQuery): Promise<FacilityCard[]>
}
