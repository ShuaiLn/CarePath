import type { CmsAdapter } from './types'
import { MockCmsAdapter } from './mockCmsAdapter'

export type { CmsAdapter } from './types'

let cached: CmsAdapter | null = null

/**
 * Real CMS integration would go through a backend proxy (see
 * docs/CarePath_AI_Plan.md Section 12); no key is required for the public
 * CMS datasets, but a proxy keeps caching/rate-limiting server-side. For
 * now this always returns the mock — swapping in a real adapter later
 * requires no changes to callers.
 */
export function getCmsAdapter(): CmsAdapter {
  if (!cached) cached = new MockCmsAdapter()
  return cached
}
