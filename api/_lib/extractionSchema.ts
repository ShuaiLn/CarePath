import { z } from 'zod'
import { ASSOCIATED_SYMPTOM_IDS } from '../../src/types/intake'
import { CLARIFICATION_REASONS, FIELD_IDS, SCOPE_FLAG_IDS } from '../../src/adapters/llm/types'

/**
 * The extraction contract's schema, defined once here in two forms that
 * MUST stay in sync by construction (both are generated from the same
 * ASSOCIATED_SYMPTOM_IDS / SCOPE_FLAG_IDS / FIELD_IDS / CLARIFICATION_REASONS
 * source-of-truth arrays, never hand-duplicated):
 *
 *   1. EXTRACTION_JSON_SCHEMA — the OpenAI Structured Outputs `json_schema`
 *      (strict mode: every property required, additionalProperties:false
 *      everywhere, "optional" fields represented as nullable).
 *   2. rawExtractionSchema — a zod schema used to validate whatever JSON
 *      the model actually returns. This is the real safety boundary: model
 *      output is untrusted regardless of what schema we asked for, so this
 *      is checked independently and rejects (not silently strips) any
 *      unknown key at any level — including a smuggled `careLevel`, `tier`,
 *      `urgencyScore`, or `recommendedCareLevel`.
 *
 * See docs plan Part 2B/Part 3/Part 8.1.
 */

const MAX_SOURCE_TEXT_LENGTH = 500

// ---- OpenAI JSON Schema (Structured Outputs, strict mode) -----------------

type JsonSchema = Record<string, unknown>

function nullableJson(schema: JsonSchema): JsonSchema {
  return { anyOf: [schema, { type: 'null' }] }
}

function valueFieldJson(valueSchema: JsonSchema): JsonSchema {
  return {
    type: 'object',
    properties: { value: valueSchema, sourceText: { type: 'string' } },
    required: ['value', 'sourceText'],
    additionalProperties: false,
  }
}

const REPORT_STATUS_JSON: JsonSchema = { type: 'string', enum: ['reported', 'denied', 'unknown'] }

const associatedSymptomsJsonProps: Record<string, JsonSchema> = Object.fromEntries(
  ASSOCIATED_SYMPTOM_IDS.map((id) => [id, nullableJson(valueFieldJson(REPORT_STATUS_JSON))]),
)

const scopeFlagsJsonProps: Record<string, JsonSchema> = Object.fromEntries(
  SCOPE_FLAG_IDS.map((id) => [id, nullableJson(valueFieldJson(REPORT_STATUS_JSON))]),
)

export const EXTRACTION_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    chiefComplaint: nullableJson(valueFieldJson({ type: 'string' })),
    location: nullableJson(valueFieldJson({ type: 'string' })),
    severity: nullableJson(valueFieldJson({ type: 'integer', minimum: 0, maximum: 10 })),
    trend: nullableJson(valueFieldJson({ type: 'string', enum: ['improving', 'stable', 'worsening'] })),
    durationPattern: nullableJson(valueFieldJson({ type: 'string', enum: ['Continuous', 'Intermittent'] })),
    onsetHours: nullableJson(valueFieldJson({ type: 'number', minimum: 0 })),
    age: nullableJson(valueFieldJson({ type: 'integer', minimum: 0, maximum: 120 })),
    associatedSymptoms: nullableJson({
      type: 'object',
      properties: associatedSymptomsJsonProps,
      required: [...ASSOCIATED_SYMPTOM_IDS],
      additionalProperties: false,
    }),
    medicalConditions: nullableJson(valueFieldJson({ type: 'array', items: { type: 'string' } })),
    currentMedications: nullableJson(valueFieldJson({ type: 'array', items: { type: 'string' } })),
    allergies: nullableJson(valueFieldJson({ type: 'array', items: { type: 'string' } })),
    scopeFlags: nullableJson({
      type: 'object',
      properties: scopeFlagsJsonProps,
      required: [...SCOPE_FLAG_IDS],
      additionalProperties: false,
    }),
    clarification: nullableJson({
      type: 'object',
      properties: {
        field: { type: 'string', enum: [...FIELD_IDS] },
        reason: { type: 'string', enum: [...CLARIFICATION_REASONS] },
      },
      required: ['field', 'reason'],
      additionalProperties: false,
    }),
  },
  required: [
    'chiefComplaint',
    'location',
    'severity',
    'trend',
    'durationPattern',
    'onsetHours',
    'age',
    'associatedSymptoms',
    'medicalConditions',
    'currentMedications',
    'allergies',
    'scopeFlags',
    'clarification',
  ],
  additionalProperties: false,
}

// ---- zod runtime validator (the actual safety boundary) -------------------

const reportStatusSchema = z.enum(['reported', 'denied', 'unknown'])

function valueField<T extends z.ZodTypeAny>(valueSchema: T) {
  return z
    .object({
      value: valueSchema,
      sourceText: z.string().trim().min(1).max(MAX_SOURCE_TEXT_LENGTH),
    })
    .strict()
    .nullable()
    .optional()
}

const associatedSymptomsShape = Object.fromEntries(
  ASSOCIATED_SYMPTOM_IDS.map((id) => [id, valueField(reportStatusSchema)]),
) as Record<(typeof ASSOCIATED_SYMPTOM_IDS)[number], ReturnType<typeof valueField<typeof reportStatusSchema>>>

const scopeFlagsShape = Object.fromEntries(SCOPE_FLAG_IDS.map((id) => [id, valueField(reportStatusSchema)])) as Record<
  (typeof SCOPE_FLAG_IDS)[number],
  ReturnType<typeof valueField<typeof reportStatusSchema>>
>

export const rawExtractionSchema = z
  .object({
    chiefComplaint: valueField(z.string().trim().min(1).max(200)),
    location: valueField(z.string().trim().min(1).max(100)),
    severity: valueField(z.number().min(0).max(10)),
    trend: valueField(z.enum(['improving', 'stable', 'worsening'])),
    durationPattern: valueField(z.enum(['Continuous', 'Intermittent'])),
    onsetHours: valueField(z.number().min(0).max(100000)),
    age: valueField(z.number().min(0).max(120)),
    associatedSymptoms: z.object(associatedSymptomsShape).strict().nullable().optional(),
    medicalConditions: valueField(z.array(z.string().trim().min(1).max(200)).max(50)),
    currentMedications: valueField(z.array(z.string().trim().min(1).max(200)).max(50)),
    allergies: valueField(z.array(z.string().trim().min(1).max(200)).max(50)),
    scopeFlags: z.object(scopeFlagsShape).strict().nullable().optional(),
    clarification: z
      .object({
        field: z.enum(FIELD_IDS),
        reason: z.enum(CLARIFICATION_REASONS),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()

export type RawExtraction = z.infer<typeof rawExtractionSchema>
