import type { MedicationAdapter } from './types'
import { MockMedicationAdapter } from './mockMedicationAdapter'

export type { MedicationAdapter } from './types'

let cached: MedicationAdapter | null = null

/**
 * A real implementation would call RxNorm + DailyMed through a backend
 * proxy (see the LLM adapter for the pattern: a shared, optional
 * VITE_API_BASE_URL plus a same-origin `/api/*` route — docs/CarePath_AI_Plan.md
 * Section 12). Until then, the mock keeps this feature usable offline.
 */
export function getMedicationAdapter(): MedicationAdapter {
  if (!cached) cached = new MockMedicationAdapter()
  return cached
}
