import type { CmsAdapter } from './types'
import { MockCmsAdapter } from './mockCmsAdapter'

export type { CmsAdapter } from './types'

let cached: CmsAdapter | null = null

/**
 * CarePath is a backend-less, fully local/offline app — this adapter never
 * calls a live network API. The mock is the permanent local-data provider,
 * not a temporary stand-in for one. It can be upgraded later to a real
 * bundled dataset (the CMS Provider Data Catalog / Hospital Price
 * Transparency data is bulk-downloadable as CSV/JSON and could back a
 * periodically-refreshed static snapshot) behind this same `CmsAdapter`
 * interface, with no changes required to callers — but never to a live API
 * call, which would reintroduce the network dependency this architecture
 * exists to avoid.
 */
export function getCmsAdapter(): CmsAdapter {
  if (!cached) cached = new MockCmsAdapter()
  return cached
}
