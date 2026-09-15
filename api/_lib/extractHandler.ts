import { rawExtractionSchema, type RawExtraction } from './extractionSchema'
import { SCOPE_FLAG_IDS } from '../../src/adapters/llm/types'
import type { ExtractionResult } from '../../src/adapters/llm/types'
import { ASSOCIATED_SYMPTOM_IDS } from '../../src/types/intake'
import type { AssociatedSymptoms, IntakeRecord } from '../../src/types/intake'
import { makeProvenance } from '../../src/types/provenance'

/**
 * The testable core of POST /api/llm/extract, independent of any HTTP
 * framework so it can be exercised directly against a fake/injectable
 * OpenAI client in tests (docs plan Part 8.2) with no live API calls, and
 * independent of any particular request/response object shape so the thin
 * Vercel entrypoint (../llm/extract.ts) stays a few lines of glue.
 *
 * Treats the model's raw output as fully untrusted: validated with a
 * strict (reject-unknown-keys) zod schema, then mapped field-by-field into
 * Partial<IntakeRecord> — nothing from the model's JSON is ever passed
 * through verbatim.
 */

export interface OpenAIExtractionDeps {
  extract(request: { message: string; questionId: string; relevantExistingFields: unknown }): Promise<unknown>
}

export interface ExtractDeps {
  openai: OpenAIExtractionDeps
}

export interface HandlerResponse {
  status: number
  body: ExtractionResult | { error: string }
}

const MAX_MESSAGE_LENGTH = 4000

interface ValidatedRequest {
  message: string
  questionId: string
  relevantExistingFields: Partial<IntakeRecord>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateRequestBody(body: unknown): ValidatedRequest | null {
  if (!isPlainObject(body)) return null
  const { message, questionId, relevantExistingFields } = body
  if (typeof message !== 'string' || message.trim().length === 0 || message.length > MAX_MESSAGE_LENGTH) return null
  if (typeof questionId !== 'string' || questionId.length === 0) return null
  if (relevantExistingFields !== undefined && !isPlainObject(relevantExistingFields)) return null
  return {
    message,
    questionId,
    relevantExistingFields: (relevantExistingFields ?? {}) as Partial<IntakeRecord>,
  }
}

const SCOPE_FLAG_TO_INTAKE_KEY: Record<(typeof SCOPE_FLAG_IDS)[number], keyof IntakeRecord> = {
  pregnancy: 'isPregnantOrPossiblyPregnant',
  mentalHealthCrisis: 'mentalHealthCrisisReported',
  poisoning: 'poisoningExposureReported',
  trauma: 'traumaInjuryReported',
  sexualHealth: 'sexualHealthConcernReported',
  postOperative: 'postOperativeComplicationReported',
  immunocompromised: 'immunocompromisedReported',
}

function existingValue(existing: Partial<IntakeRecord>, key: keyof IntakeRecord): unknown {
  const entry = existing[key] as { value?: unknown } | undefined
  return entry?.value
}

/**
 * Map validated model output onto Partial<IntakeRecord>, wrapping every
 * value in a provenance envelope (source: 'patient_reported'), exactly as
 * MockLlmAdapter does — see docs plan Part 2B "doing it backend-side keeps
 * RemoteLlmAdapter's contract identical to what it already promises."
 *
 * Guards, applied uniformly to every reported/denied/unknown field: this
 * turn's extraction is never allowed to downgrade a field the patient
 * already explicitly *reported* to *denied* — an unmentioned or ambiguous
 * symptom must never silently become denied (a blanket "no" later in the
 * conversation should not be read as retracting an earlier positive red
 * flag). Upgrading toward "reported" is always allowed; only the
 * safety-relevant softening direction is blocked.
 */
function mapToIntake(raw: RawExtraction, existing: Partial<IntakeRecord>): Partial<IntakeRecord> {
  const out: Partial<IntakeRecord> = {}

  if (raw.chiefComplaint) out.chiefComplaint = makeProvenance(raw.chiefComplaint.value, 'patient_reported')
  if (raw.location) out.location = makeProvenance(raw.location.value, 'patient_reported')
  if (raw.severity) out.severity = makeProvenance(raw.severity.value, 'patient_reported')
  if (raw.trend) out.trend = makeProvenance(raw.trend.value, 'patient_reported')
  if (raw.durationPattern) out.durationPattern = makeProvenance(raw.durationPattern.value, 'patient_reported')
  if (raw.onsetHours) out.onsetHours = makeProvenance(raw.onsetHours.value, 'patient_reported')
  if (raw.age) out.age = makeProvenance(raw.age.value, 'patient_reported')
  if (raw.medicalConditions) out.medicalConditions = makeProvenance(raw.medicalConditions.value, 'patient_reported')
  if (raw.currentMedications) out.currentMedications = makeProvenance(raw.currentMedications.value, 'patient_reported')
  if (raw.allergies) out.allergies = makeProvenance(raw.allergies.value, 'patient_reported')

  if (raw.associatedSymptoms) {
    const merged: AssociatedSymptoms = {}
    for (const id of ASSOCIATED_SYMPTOM_IDS) {
      const field = raw.associatedSymptoms[id]
      if (!field) continue
      const existingStatus = existing.associatedSymptoms?.[id]?.value
      if (existingStatus === 'reported' && field.value === 'denied') continue
      merged[id] = makeProvenance(field.value, 'patient_reported')
    }
    if (Object.keys(merged).length > 0) out.associatedSymptoms = merged
  }

  if (raw.scopeFlags) {
    for (const flagId of SCOPE_FLAG_IDS) {
      const field = raw.scopeFlags[flagId]
      if (!field) continue
      const intakeKey = SCOPE_FLAG_TO_INTAKE_KEY[flagId]
      const existingStatus = existingValue(existing, intakeKey)
      if (existingStatus === 'reported' && field.value === 'denied') continue
      ;(out as Record<string, unknown>)[intakeKey] = makeProvenance(field.value, 'patient_reported')
    }
  }

  return out
}

export async function handleExtractRequest(rawBody: unknown, deps: ExtractDeps): Promise<HandlerResponse> {
  const request = validateRequestBody(rawBody)
  if (!request) {
    return { status: 400, body: { error: 'invalid_request' } }
  }

  let rawModelOutput: unknown
  try {
    rawModelOutput = await deps.openai.extract({
      message: request.message,
      questionId: request.questionId,
      relevantExistingFields: request.relevantExistingFields,
    })
  } catch {
    // Never surface the upstream error's message — it may embed request
    // content. The client's own fallback-to-mock handles this uniformly,
    // exactly as it would handle a network failure.
    return { status: 502, body: { error: 'llm_upstream_error' } }
  }

  const parsed = rawExtractionSchema.safeParse(rawModelOutput)
  if (!parsed.success) {
    // Includes: malformed JSON shape, an unrecognized top-level key (e.g. a
    // smuggled careLevel/tier/urgencyScore/recommendedCareLevel field),
    // wrong types, or a value field missing its required sourceText
    // evidence. All treated identically — reject the whole response rather
    // than partially trust it.
    return { status: 502, body: { error: 'llm_invalid_output' } }
  }

  const result: ExtractionResult = {
    updatedIntake: mapToIntake(parsed.data, request.relevantExistingFields),
    clarification: parsed.data.clarification ?? null,
    extractionMode: 'remote',
  }
  return { status: 200, body: result }
}
