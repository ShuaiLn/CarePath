import type { IntakeRecord } from '../../types/intake'
import type { IntakeQuestionId } from '../../intake/fieldChecklist'
import type { CareLevelResult } from '../../types/careLevel'

/**
 * LLM adapter interface. See docs/CarePath_AI_Plan.md Section 4 "AI's scoped
 * role" and Section 12's governing pattern:
 *
 *   Safety rules -> structured risk engine -> LLM explanation
 *
 * An LlmAdapter is ONLY ever used for:
 *   1. Natural-language understanding (extracting structured fields).
 *   2. Nothing else decision-relevant — explaining a result the
 *      deterministic engines already produced.
 *
 * Notice there is no method here, anywhere, that lets an adapter return a
 * care level, a routing decision, or a numeric confidence in its own
 * understanding. That is a deliberate structural constraint: it is not
 * possible for an LlmAdapter implementation to influence the final care
 * level even if it tried, because nothing downstream reads a field like
 * that from its output.
 */

export interface ExtractionResult {
  /**
   * Partial, already provenance-wrapped fields extracted from the user's
   * message. Source is always 'patient_reported' since this reflects what
   * the patient said, not an uploaded document. `confirmedByUser` is
   * always false here — confirmation only happens in the explicit
   * "Here's what I understood" step (Section 3).
   */
  updatedIntake: Partial<IntakeRecord>
  /**
   * A clarifying question to ask instead of guessing, or null when the
   * extraction is usable as-is. There is intentionally no numeric
   * confidence field — see Section 3 "No numeric AI confidence."
   */
  needsClarification: string | null
}

export interface ExtractionInput {
  message: string
  /** Which question this message is answering, or 'initial' for the first free-text message. */
  questionId: IntakeQuestionId | 'initial'
  currentIntake: IntakeRecord
}

export interface LlmAdapter {
  readonly name: string
  extractFromMessage(input: ExtractionInput): Promise<ExtractionResult>
  /**
   * Plain-language explanation of an ALREADY-DECIDED care level. This
   * method receives the deterministic result and must not be able to
   * change it — its return type is a string, not a CareLevelResult.
   */
  explainCareLevel(result: CareLevelResult): Promise<string>
}
