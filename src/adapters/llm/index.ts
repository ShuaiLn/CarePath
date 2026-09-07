import type { LlmAdapter } from './types'
import { MockLlmAdapter } from './mockLlmAdapter'
import { RemoteLlmAdapter } from './remoteLlmAdapter'

export type { LlmAdapter, ExtractionInput, ExtractionResult } from './types'

let cachedAdapter: LlmAdapter | null = null

/**
 * Adapter factory. Reads VITE_LLM_BACKEND_URL to decide whether to use a
 * real backend proxy or the offline mock. Missing configuration NEVER
 * throws or blocks the app — it silently uses the deterministic mock, per
 * the project requirement that a missing API key must not block the MVP.
 */
export function getLlmAdapter(): LlmAdapter {
  if (cachedAdapter) return cachedAdapter
  const backendUrl = import.meta.env.VITE_LLM_BACKEND_URL as string | undefined
  cachedAdapter = backendUrl ? new RemoteLlmAdapter(backendUrl) : new MockLlmAdapter()
  return cachedAdapter
}
