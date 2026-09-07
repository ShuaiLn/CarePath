/**
 * Medication lookup grounded in RxNorm identifiers + DailyMed label data —
 * never LLM memory. See docs/CarePath_AI_Plan.md Section 8. The AI never
 * alters or recommends dosing; this type has no field for a recommended
 * dose, only what the label says.
 */
export interface MedicationInfo {
  queryText: string
  rxcui: string | null
  normalizedName: string
  genericName: string | null
  commonUses: string[]
  commonSideEffects: string[]
  labelWarnings: string[]
  pharmacistQuestions: string[]
  source: 'RxNorm + DailyMed (mock)'
  found: boolean
}
