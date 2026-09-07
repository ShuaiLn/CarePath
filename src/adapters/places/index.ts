import type { PlacesAdapter } from './types'
import { MockPlacesAdapter } from './mockPlacesAdapter'

export type { PlacesAdapter, FacilitySearchQuery } from './types'

let cached: PlacesAdapter | null = null

/**
 * Factory for the Places adapter. A real Google Places integration would
 * go through a backend proxy configured via VITE_PLACES_BACKEND_URL (see
 * docs/CarePath_AI_Plan.md Section 12); until that's wired up, this always
 * returns the deterministic mock so facility search keeps working with no
 * API key configured.
 */
export function getPlacesAdapter(): PlacesAdapter {
  if (!cached) cached = new MockPlacesAdapter()
  return cached
}
