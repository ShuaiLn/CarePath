/**
 * Provenance envelope — see docs/CarePath_AI_Plan.md Section 9.
 *
 * Every important structured field in the system carries this envelope instead
 * of a bare value, so the rest of the system always knows where a fact came
 * from and whether the user has confirmed it.
 */

export type SourceType =
  | 'patient_reported'
  | 'uploaded_document'
  | 'medication_label'
  | 'clinician_document'
  | 'CarePath_generated'

/**
 * Reserved for data-completeness cases only (e.g. the cost-estimate confidence
 * label in Section 6). Never used to display an AI's self-assessed confidence
 * in its own extraction or reasoning — see Section 3/4/9. If the AI is unsure
 * about something it extracted, the product response is a clarifying question,
 * never a number.
 */
export type DataCompleteness = 'low' | 'medium' | 'high'

export interface Provenance<T> {
  value: T
  source: SourceType
  confirmedByUser: boolean
  capturedAt: string
  /** Data-completeness only. See DataCompleteness doc comment. */
  confidence?: DataCompleteness
}

export function makeProvenance<T>(
  value: T,
  source: SourceType,
  opts: Partial<Pick<Provenance<T>, 'confirmedByUser' | 'capturedAt' | 'confidence'>> = {},
): Provenance<T> {
  return {
    value,
    source,
    confirmedByUser: opts.confirmedByUser ?? false,
    capturedAt: opts.capturedAt ?? new Date().toISOString(),
    confidence: opts.confidence,
  }
}

export function confirmProvenance<T>(p: Provenance<T>, newValue?: T): Provenance<T> {
  return {
    ...p,
    value: newValue !== undefined ? newValue : p.value,
    confirmedByUser: true,
    capturedAt: new Date().toISOString(),
  }
}

/**
 * Strict tri-state for symptom reporting. "unknown" must never be silently
 * treated as "denied" — a symptom the user was never asked about, or didn't
 * answer, is categorically different from one they explicitly said they
 * don't have.
 */
export type ReportStatus = 'reported' | 'denied' | 'unknown'
