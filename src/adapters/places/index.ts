import type { PlacesAdapter } from './types'
import { MockPlacesAdapter } from './mockPlacesAdapter'

export type { PlacesAdapter, FacilitySearchQuery } from './types'

let cached: PlacesAdapter | null = null

/**
 * Factory for the Places adapter. CarePath is a backend-less, fully
 * local/offline app — this adapter never calls a live network API, and the
 * mock is a permanent, honestly-labeled placeholder rather than a temporary
 * stand-in. Live facility search (open-now status, real-time distance,
 * current ratings) has no true offline equivalent, so unlike Medication/CMS
 * there's no "real bundled dataset" upgrade path that fully replaces it — a
 * future enhancement could bundle a static regional facility directory with
 * an explicit "as of <date>, verify before visiting" disclaimer, but that is
 * a materially different, clearly-labeled feature, never presented as live
 * search.
 */
export function getPlacesAdapter(): PlacesAdapter {
  if (!cached) cached = new MockPlacesAdapter()
  return cached
}
