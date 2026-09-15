import type { LlmAdapter, ExtractionContext, ExtractionResult } from './types'
import type { CareLevelResult } from '../../types/careLevel'
import type { IntakeRecord } from '../../types/intake'
import { MockLlmAdapter } from './mockLlmAdapter'
import { createOllamaExtractionClient } from './ollamaClient'
import { rawExtractionSchema } from './extractionSchema'
import { mapToIntake } from './extractionMapping'
import { isLoopbackUrl } from './loopbackGuard'

/** Only these keys are ever allowed onto Partial<IntakeRecord> coming back
 * from the model — anything else (e.g. an injected careLevel/tier key) is
 * dropped before it can enter application state. This is defense in depth
 * on top of the zod `.strict()` schema; the deterministic engines already
 * structurally ignore unknown keys (see llmCannotOverrideCareLevel.test.ts),
 * but untrusted model output should never be trusted further than it has
 * to be — arguably more valuable now than when this guarded a backend's own
 * response, since a local model is less audited than a hosted one. */
const ALLOWED_INTAKE_KEYS = new Set<keyof IntakeRecord>([
  'chiefComplaint',
  'location',
  'onsetDescription',
  'onsetHours',
  'durationPattern',
  'severity',
  'trend',
  'character',
  'age',
  'isPregnantOrPossiblyPregnant',
  'medicalConditions',
  'currentMedications',
  'allergies',
  'recentProceduresOrInjuries',
  'vitalSigns',
  'riskFactors',
  'associatedSymptoms',
  'mentalHealthCrisisReported',
  'poisoningExposureReported',
  'traumaInjuryReported',
  'sexualHealthConcernReported',
  'postOperativeComplicationReported',
  'immunocompromisedReported',
])

export function sanitizeUpdatedIntake(value: Partial<IntakeRecord>): Partial<IntakeRecord> {
  const out: Partial<IntakeRecord> = {}
  for (const [key, v] of Object.entries(value)) {
    if (ALLOWED_INTAKE_KEYS.has(key as keyof IntakeRecord)) {
      ;(out as Record<string, unknown>)[key] = v
    }
  }
  return out
}

/**
 * Adapter that calls a locally-running Ollama daemon directly from the
 * browser — there is no CarePath-owned backend or serverless proxy anywhere
 * in the stack. Ollama requires no API key, so the only reason a
 * server-side proxy previously existed (never let AI provider keys live
 * client-side) no longer applies; the browser was always the ultimate trust
 * boundary for a local-only, single-user tool.
 *
 * The app never blocks on Ollama being unavailable: any failure — a
 * configured base URL that isn't loopback, connection refused, model not
 * pulled, timeout, malformed output, or schema validation failure — falls
 * back to the deterministic mock adapter automatically.
 */
export class LocalLlmAdapter implements LlmAdapter {
  readonly name = 'local-ollama'
  private readonly fallback = new MockLlmAdapter()
  private readonly baseUrl: string
  private readonly model: string
  /** Checked once at construction time, not re-checked per call — the
   * configured base URL doesn't change mid-session. */
  private readonly baseUrlIsLoopback: boolean

  constructor(baseUrl = 'http://127.0.0.1:11434', model?: string) {
    this.baseUrl = baseUrl
    this.model = model ?? ''
    this.baseUrlIsLoopback = isLoopbackUrl(baseUrl)
  }

  async extractFromMessage(input: ExtractionContext): Promise<ExtractionResult> {
    if (!this.baseUrlIsLoopback) {
      console.warn(
        '[LocalLlmAdapter] configured base URL is not a loopback address; refusing to call it and falling back to mock adapter',
      )
      return this.fallback.extractFromMessage(input)
    }

    try {
      const client = this.model ? createOllamaExtractionClient(this.baseUrl, this.model) : createOllamaExtractionClient(this.baseUrl)
      const rawModelOutput = await client.extract({
        message: input.message,
        questionId: input.questionId,
        relevantExistingFields: input.relevantExistingFields,
      })

      const parsed = rawExtractionSchema.safeParse(rawModelOutput)
      if (!parsed.success) {
        throw new Error('Ollama output failed schema validation')
      }

      return {
        updatedIntake: sanitizeUpdatedIntake(mapToIntake(parsed.data, input.relevantExistingFields)),
        clarification: parsed.data.clarification ?? null,
        extractionMode: 'local-llm',
      }
    } catch (err) {
      console.warn('[LocalLlmAdapter] falling back to mock adapter:', err)
      return this.fallback.extractFromMessage(input)
    }
  }

  /**
   * Care-level explanation stays a deterministic template — see
   * MockLlmAdapter's template, which is auditable and has zero exposure to
   * leaking the never-shown internalScore, since it never sees anything but
   * already-safe factor/tier strings. No Ollama call is made here.
   */
  async explainCareLevel(result: CareLevelResult): Promise<string> {
    return this.fallback.explainCareLevel(result)
  }
}
