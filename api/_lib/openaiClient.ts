import { EXTRACTION_JSON_SCHEMA } from './extractionSchema'

/**
 * Thin wrapper around OpenAI's Responses API (Structured Outputs), kept
 * behind a small interface (OpenAIExtractionClient) so extractHandler.ts
 * can be tested against a fake/injectable client with no live network
 * calls — see docs plan Part 8.2.
 *
 * Model verified against OpenAI's own docs (developers.openai.com) at
 * implementation time (September 2026); the model catalog changes over
 * time, so this stays overridable via OPENAI_EXTRACTION_MODEL without a
 * code change — see the README for the current UNVERIFIED note.
 */

export interface OpenAIExtractionRequest {
  message: string
  questionId: string
  relevantExistingFields: unknown
}

export interface OpenAIExtractionClient {
  /** Returns the raw, still-untrusted parsed JSON the model produced. */
  extract(request: OpenAIExtractionRequest): Promise<unknown>
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
/** Shorter than the client's own ~15s timeout (remoteLlmAdapter.ts) so the
 * server has a chance to return a clean error before the client gives up. */
const SERVER_TIMEOUT_MS = 10000
const DEFAULT_MODEL = 'gpt-5.6-luna'

const SYSTEM_PROMPT = `You are a medical-intake language-understanding assistant for CarePath AI, a healthcare-navigation tool (not a diagnosis tool).

Your ONLY job is to extract structured facts from the patient's latest message into the given JSON schema, using the current question and any provided prior context.

Hard rules:
- Never decide, suggest, imply, or mention a care level, urgency, triage decision, diagnosis, or how serious something is.
- Never tell the user whether something is or isn't an emergency.
- Only populate a field when the message gives direct evidence for it in this turn; every populated field's "sourceText" must be the exact supporting fragment from the message.
- Never invent facts that are not present in the message.
- If the message is ambiguous, hedged/uncertain, mentions multiple possible values for one field, or contradicts prior context, leave that specific field unset and instead set "clarification" to the closest matching field id and reason from the schema's enums. Do not guess.
- A symptom or fact the patient did not mention must stay unset (unknown) — never infer "denied" from silence. Only mark something "denied" on an explicit, direct negation.
- Output must conform exactly to the provided JSON schema and contain nothing else.`

interface OpenAIResponsesContentItem {
  type?: string
  text?: string
  refusal?: string
}

interface OpenAIResponsesOutputItem {
  type?: string
  content?: OpenAIResponsesContentItem[]
}

interface OpenAIResponsesBody {
  status?: string
  output?: OpenAIResponsesOutputItem[]
  output_text?: string
}

function extractOutputJsonText(data: OpenAIResponsesBody): string {
  if (data.status && data.status !== 'completed') {
    throw new Error(`OpenAI response status: ${data.status}`)
  }
  if (typeof data.output_text === 'string' && data.output_text.length > 0) {
    return data.output_text
  }
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item.content)) continue
      for (const c of item.content) {
        if (c.type === 'refusal') {
          throw new Error('OpenAI refused the request')
        }
        if (c.type === 'output_text' && typeof c.text === 'string' && c.text.length > 0) {
          return c.text
        }
      }
    }
  }
  throw new Error('OpenAI response contained no output text')
}

async function attemptOnce(body: unknown, apiKey: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS)
  try {
    return await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export function createOpenAIExtractionClient(apiKey: string, model: string = DEFAULT_MODEL): OpenAIExtractionClient {
  return {
    async extract(request) {
      const requestBody = {
        model,
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(request) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'carepath_extraction',
            schema: EXTRACTION_JSON_SCHEMA,
            strict: true,
          },
        },
        max_output_tokens: 1024,
      }

      let res: Response
      try {
        res = await attemptOnce(requestBody, apiKey)
      } catch {
        // Network error or client-side timeout — one bounded retry.
        res = await attemptOnce(requestBody, apiKey)
      }

      if (res.status >= 500) {
        // Transient server error — one bounded retry, never for 4xx.
        try {
          res = await attemptOnce(requestBody, apiKey)
        } catch {
          throw new Error('OpenAI request failed after retry')
        }
      }

      if (!res.ok) {
        throw new Error(`OpenAI returned ${res.status}`)
      }

      const data = (await res.json()) as OpenAIResponsesBody
      const text = extractOutputJsonText(data)
      try {
        return JSON.parse(text)
      } catch {
        throw new Error('OpenAI output was not valid JSON')
      }
    },
  }
}
