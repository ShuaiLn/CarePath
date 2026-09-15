import type { LlmAdapter } from './types'
import { RemoteLlmAdapter } from './remoteLlmAdapter'

export type { LlmAdapter, ExtractionContext, ExtractionResult, Clarification, ClarificationReason, FieldId } from './types'

let cachedAdapter: LlmAdapter | null = null

/**
 * Adapter factory. Always returns a RemoteLlmAdapter pointed at
 * VITE_API_BASE_URL (or, when unset, same-origin relative paths like
 * `/api/llm/extract`) — it never branches on "is a URL configured" first.
 * A missing backend/API key NEVER throws or blocks the app: the adapter's
 * own try/catch falls back to the deterministic offline mock on any
 * failure (missing route, network error, timeout, malformed response),
 * per the project requirement that a missing API key must not block the
 * MVP.
 */
export function getLlmAdapter(): LlmAdapter {
  if (cachedAdapter) return cachedAdapter
  const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  cachedAdapter = new RemoteLlmAdapter(baseUrl)
  return cachedAdapter
}
