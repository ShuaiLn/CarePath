import type { MedicationInfo } from '../../types/medication'

/**
 * Medication lookup adapter interface, grounded in RxNorm + DailyMed (see
 * docs/CarePath_AI_Plan.md Section 8) — never LLM memory. Hard rule: no
 * implementation of this interface may return a recommended/altered dose;
 * MedicationInfo has no field for one.
 */
export interface MedicationAdapter {
  readonly name: string
  lookup(query: string): Promise<MedicationInfo>
}
