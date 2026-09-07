/**
 * Care Routing Hierarchy types. See docs/CarePath_AI_Plan.md Section 5.
 * Care setting and specialty are different questions and must never be
 * conflated — a specialty name should never read as "book this now."
 */
export type CareSetting =
  | 'Emergency Department'
  | 'Urgent Care'
  | 'Primary care soon'
  | 'Self-care'

export type SymptomCategory =
  | 'general_unclear'
  | 'abdominal_digestive'
  | 'chest_cardiac'
  | 'respiratory'
  | 'headache_neuro'
  | 'musculoskeletal'
  | 'skin'
  | 'urinary'
  | 'gynecologic'
  | 'eye'
  | 'ent'
  | 'endocrine'
  | 'rheumatologic'
  | 'allergy'

export interface CareRoutingResult {
  careSetting: CareSetting
  bestStartingProvider: string
  /** Explicitly framed as "later, depending on evaluation" — never the headline. */
  possibleDownstreamSpecialty: string
  category: SymptomCategory
  why: string
  urgencyTimeframe: string
}
