import type { LlmAdapter, ExtractionContext, ExtractionResult, Clarification } from './types'
import { CLARIFICATION_REASONS } from './types'
import type { CareLevelResult } from '../../types/careLevel'
import type { IntakeRecord } from '../../types/intake'
import { MockLlmAdapter } from './mockLlmAdapter'

/** Client-side ceiling on the extraction call — see docs plan Part 3
 * "Timeout handling": on abort, fall through to the mock exactly as a
 * network error does. Kept comfortably above the server's own timeout
 * (api/_lib/openaiClient.ts) so the server has a chance to return a clean
 * error first. */
const EXTRACTION_TIMEOUT_MS = 15000

/** Only these keys are ever allowed onto Partial<IntakeRecord> coming back
 * over the network — anything else (e.g. an injected careLevel/tier key)
 * is dropped before it can enter application state. This is defense in
 * depth on top of the backend's own allowlist; the deterministic engines
 * already structurally ignore unknown keys (see
 * llmCannotOverrideCareLevel.test.ts), but untrusted network input should
 * never be trusted further than it has to be. */
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

function sanitizeUpdatedIntake(value: unknown): Partial<IntakeRecord> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: Partial<IntakeRecord> = {}
  for (const [key, v] of Object.entries(value)) {
    if (ALLOWED_INTAKE_KEYS.has(key as keyof IntakeRecord)) {
      ;(out as Record<string, unknown>)[key] = v
    }
  }
  return out
}

function isValidClarification(value: unknown): value is Clarification {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return typeof c.field === 'string' && typeof c.reason === 'string' && (CLARIFICATION_REASONS as readonly string[]).includes(c.reason)
}

/** Minimal structural validation of the backend's response — the backend
 * is our own code and already schema-validates the model's raw output
 * (api/_lib/extractHandler.ts), but any network boundary is untrusted by
 * default: a malformed or unexpected shape is treated the same as a
 * network failure and triggers the same offline fallback. */
function parseExtractionResponse(data: unknown): ExtractionResult | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  if (d.extractionMode !== 'remote') return null
  const clarification = d.clarification === null ? null : isValidClarification(d.clarification) ? d.clarification : undefined
  if (clarification === undefined) return null
  return {
    updatedIntake: sanitizeUpdatedIntake(d.updatedIntake),
    clarification,
    extractionMode: 'remote',
  }
}

/**
 * Adapter that calls a backend/serverless proxy, per
 * docs/CarePath_AI_Plan.md Section 12 ("AI provider keys must never live
 * client-side; a backend/serverless layer proxies AI ... so provider keys
 * never live client-side"). The app never blocks on a missing API key or
 * unreachable backend: any failure (network error, non-2xx, malformed
 * body, or timeout) falls back to the deterministic mock adapter
 * automatically.
 */
export class RemoteLlmAdapter implements LlmAdapter {
  readonly name = 'remote-proxy'
  private readonly fallback = new MockLlmAdapter()
  private readonly baseUrl: string

  /** `baseUrl` defaults to '' so requests use same-origin relative paths
   * (`/api/llm/extract`) — the default deployment shape where the frontend
   * and the `/api/*` functions ship as one project. Only set when the
   * frontend and backend are deployed to separate origins. */
  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl
  }

  async extractFromMessage(input: ExtractionContext): Promise<ExtractionResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS)
    try {
      const res = await fetch(`${this.baseUrl}/api/llm/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`Backend returned ${res.status}`)
      const parsed = parseExtractionResponse(await res.json())
      if (!parsed) throw new Error('Backend returned a malformed extraction response')
      return parsed
    } catch (err) {
      console.warn('[RemoteLlmAdapter] falling back to mock adapter:', err)
      return this.fallback.extractFromMessage(input)
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Care-level explanation stays a deterministic template for v1 — see
   * docs plan Part 3: MockLlmAdapter's template is auditable and has zero
   * exposure to leaking the never-shown internalScore, since it never sees
   * anything but already-safe factor/tier strings. No network call is made
   * here; an OpenAI-polished rewrite (given only a CareExplanationInput DTO
   * that excludes internalScore) is an explicitly optional, not-yet-built
   * P1/P2 enhancement.
   */
  async explainCareLevel(result: CareLevelResult): Promise<string> {
    return this.fallback.explainCareLevel(result)
  }
}
