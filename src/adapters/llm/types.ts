import type { IntakeRecord } from '../../types/intake'
import { ASSOCIATED_SYMPTOM_IDS } from '../../types/intake'
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

/**
 * Fixed, non-medical-judgment reasons a model can flag for why a field
 * couldn't be confidently extracted this turn. There is no free-text
 * alternative — see FieldId/Clarification below.
 */
export const CLARIFICATION_REASONS = [
  'ambiguous_value',
  'multiple_values',
  'unparseable',
  'hedged_uncertain',
  'contradicts_prior',
] as const

export type ClarificationReason = (typeof CLARIFICATION_REASONS)[number]

const TOP_LEVEL_FIELD_IDS = [
  'chiefComplaint',
  'location',
  'severity',
  'trend',
  'durationPattern',
  'onsetHours',
  'age',
  'medicalConditions',
  'currentMedications',
  'allergies',
  'screeningSymptoms',
  'moreScreeningSymptoms',
] as const

/** Scope-flag ids, matching the free-text scope fields on IntakeRecord. */
export const SCOPE_FLAG_IDS = [
  'pregnancy',
  'mentalHealthCrisis',
  'poisoning',
  'trauma',
  'sexualHealth',
  'postOperative',
  'immunocompromised',
] as const

export type ScopeFlagId = (typeof SCOPE_FLAG_IDS)[number]

/**
 * The closed set of fields a clarification can point at: every top-level
 * extractable field, plus one entry per associated symptom and per scope
 * flag. Closed and enumerable on purpose — see clarificationTemplates.ts,
 * which must map every (field, reason) pair here to a fixed sentence.
 */
export const FIELD_IDS = [
  ...TOP_LEVEL_FIELD_IDS,
  ...ASSOCIATED_SYMPTOM_IDS.map((id) => `associatedSymptoms.${id}` as const),
  ...SCOPE_FLAG_IDS.map((id) => `scopeFlags.${id}` as const),
] as const

export type FieldId = (typeof FIELD_IDS)[number]

/**
 * The ONLY signal a model may emit when it can't confidently map an
 * utterance to a value. `field`/`reason` are both closed enums — never a
 * free-text string the model composes itself. CarePath's own deterministic
 * lookup table (src/intake/clarificationTemplates.ts) is the only thing
 * allowed to turn this into the sentence a user actually reads.
 */
export interface Clarification {
  field: FieldId
  reason: ClarificationReason
}

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
   * A structured signal to ask a clarifying question instead of guessing,
   * or null when the extraction is usable as-is. There is intentionally no
   * numeric confidence field — see Section 3 "No numeric AI confidence" —
   * and no free-text field either, since a model-authored sentence could
   * smuggle judgment-flavored language past every other safeguard.
   */
  clarification: Clarification | null
  /**
   * Which extraction path actually produced this result. Lets the app
   * notice (for logging/QA) when it silently degraded from real NLU to the
   * offline keyword-matching fallback mid-conversation, without ever
   * blocking or erroring the chat. Both values are honestly "local" now —
   * there is no CarePath-owned backend or cloud AI provider anywhere in the
   * stack; 'local-llm' means a locally-running Ollama daemon produced this
   * result, 'local-fallback' means the deterministic rule-based mock did.
   */
  extractionMode: 'local-llm' | 'local-fallback'
}

export interface ExtractionContext {
  message: string
  /** Which question this message is answering, or 'initial' for the first free-text message. */
  questionId: IntakeQuestionId | 'initial'
  /**
   * A deterministically-selected minimal slice of the running intake
   * record — only what's actually relevant to interpreting this message
   * (see selectRelevantContext in conversationEngine.ts). Replaces sending
   * the full record on every turn, which would be more PHI in transit than
   * any single extraction call needs.
   */
  relevantExistingFields: Partial<IntakeRecord>
}

export interface LlmAdapter {
  readonly name: string
  extractFromMessage(input: ExtractionContext): Promise<ExtractionResult>
  /**
   * Plain-language explanation of an ALREADY-DECIDED care level. This
   * method receives the deterministic result and must not be able to
   * change it — its return type is a string, not a CareLevelResult.
   */
  explainCareLevel(result: CareLevelResult): Promise<string>
}
