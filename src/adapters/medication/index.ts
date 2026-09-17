import type { MedicationAdapter } from './types'
import { MockMedicationAdapter } from './mockMedicationAdapter'

export type { MedicationAdapter } from './types'

let cached: MedicationAdapter | null = null

/**
 * CarePath is a backend-less, fully local/offline app — this adapter never
 * calls a live network API. The mock is the permanent local-data provider,
 * not a temporary stand-in for one. It can be upgraded later to a real
 * bundled dataset (RxNorm/DailyMed both publish bulk-downloadable data that
 * could back a curated local JSON/SQLite snapshot) behind this same
 * `MedicationAdapter` interface, with no changes required to callers — but
 * never to a live API call, which would reintroduce the network dependency
 * this architecture exists to avoid.
 */
export function getMedicationAdapter(): MedicationAdapter {
  if (!cached) cached = new MockMedicationAdapter()
  return cached
}
