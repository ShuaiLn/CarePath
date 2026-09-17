import type { LlmAdapter } from './types'
import { LocalLlmAdapter } from './localLlmAdapter'

export type { LlmAdapter, ExtractionContext, ExtractionResult, Clarification, ClarificationReason, FieldId } from './types'

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

let cachedAdapter: LlmAdapter | null = null

/**
 * Adapter factory. Always returns a LocalLlmAdapter pointed at a
 * locally-running Ollama daemon (VITE_OLLAMA_BASE_URL, defaulting to
 * `http://127.0.0.1:11434`) — there is no CarePath-owned backend anywhere
 * in the stack. Ollama not running, not reachable, or a misconfigured
 * (non-loopback) base URL NEVER throws or blocks the app: the adapter's own
 * validation and try/catch fall back to the deterministic offline mock on
 * any failure, per the project requirement that a missing/unavailable local
 * model must not block the MVP.
 */
export function getLlmAdapter(): LlmAdapter {
  if (cachedAdapter) return cachedAdapter
  const baseUrl = (import.meta.env.VITE_OLLAMA_BASE_URL as string | undefined) ?? DEFAULT_OLLAMA_BASE_URL
  const model = import.meta.env.VITE_OLLAMA_MODEL as string | undefined
  cachedAdapter = new LocalLlmAdapter(baseUrl, model)
  return cachedAdapter
}
