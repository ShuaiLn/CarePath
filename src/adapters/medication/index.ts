import type { MedicationAdapter } from './types'
import { MockMedicationAdapter } from './mockMedicationAdapter'

export type { MedicationAdapter } from './types'

let cached: MedicationAdapter | null = null

/**
 * A real implementation would call RxNorm + DailyMed through a backend
 * proxy configured via VITE_MEDICATION_BACKEND_URL (see
 * docs/CarePath_AI_Plan.md Section 12). Until then, the mock keeps this
 * feature usable offline.
 */
export function getMedicationAdapter(): MedicationAdapter {
  if (!cached) cached = new MockMedicationAdapter()
  return cached
}
