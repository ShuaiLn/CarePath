import { EXTRACTION_JSON_SCHEMA } from './extractionSchema'
import { isLoopbackUrl } from './loopbackGuard'

/**
 * Thin wrapper around a locally-running Ollama daemon's chat API
 * (`POST /api/chat`), kept behind a small interface (OllamaExtractionClient)
 * so LocalLlmAdapter can be tested against a fake/injectable client with no
 * live network calls. Structural analog of the OpenAI Responses API client
 * this replaces: same system prompt (model-agnostic), same bounded-retry
 * policy (one retry on network error, one retry on 5xx, never on 4xx), same
 * per-attempt AbortController timeout.
 *
 * Ollama's exact `format`/structured-output API surface and the default
 * model below should be re-verified against Ollama's current docs
 * (https://ollama.com and https://ollama.com/library) at implementation
 * time — the model catalog changes over time, so this stays overridable via
 * VITE_OLLAMA_MODEL without a code change.
 */

export interface OllamaExtractionRequest {
  message: string
  questionId: string
  relevantExistingFields: unknown
}

export interface OllamaExtractionClient {
  /** Returns the raw, still-untrusted parsed JSON the model produced. */
  extract(request: OllamaExtractionRequest): Promise<unknown>
}

/** Per-attempt timeout; the bounded retry policy below means the worst case
 * is roughly 2x this. Kept comfortably below LocalLlmAdapter's own ceiling
 * so the caller always gets a clean fallback rather than an indefinite hang. */
const REQUEST_TIMEOUT_MS = 10000

const DEFAULT_MODEL = 'llama3.2'

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

interface OllamaChatResponseBody {
  message?: { content?: string }
}

async function attemptOnce(url: string, body: unknown): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export function createOllamaExtractionClient(baseUrl: string, model: string = DEFAULT_MODEL): OllamaExtractionClient {
  return {
    async extract(request) {
      // Defense in depth: LocalLlmAdapter already gates on this before ever
      // constructing this client, but this file is the one place `fetch` is
      // ever called from src/ — so the same check is repeated here as the
      // last line of defense. See loopbackGuard.ts and
      // networkSurfaceAudit.test.ts, which statically verifies this call
      // site is actually gated.
      if (!isLoopbackUrl(baseUrl)) {
        throw new Error('[ollamaClient] refusing to call a non-loopback base URL')
      }

      const url = `${baseUrl}/api/chat`
      const requestBody = {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(request) },
        ],
        format: EXTRACTION_JSON_SCHEMA,
        stream: false,
      }

      let res: Response
      try {
        res = await attemptOnce(url, requestBody)
      } catch {
        // Network error or client-side timeout — one bounded retry.
        res = await attemptOnce(url, requestBody)
      }

      if (res.status >= 500) {
        // Transient server error — one bounded retry, never for 4xx.
        try {
          res = await attemptOnce(url, requestBody)
        } catch {
          throw new Error('Ollama request failed after retry')
        }
      }

      if (!res.ok) {
        throw new Error(`Ollama returned ${res.status}`)
      }

      const data = (await res.json()) as OllamaChatResponseBody
      const content = data.message?.content
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('Ollama response contained no message content')
      }
      try {
        return JSON.parse(content)
      } catch {
        throw new Error('Ollama output was not valid JSON')
      }
    },
  }
}
