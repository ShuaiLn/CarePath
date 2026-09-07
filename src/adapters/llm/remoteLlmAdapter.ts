import type { LlmAdapter, ExtractionInput, ExtractionResult } from './types'
import type { CareLevelResult } from '../../types/careLevel'
import { MockLlmAdapter } from './mockLlmAdapter'

/**
 * Adapter that calls a backend/serverless proxy, per
 * docs/CarePath_AI_Plan.md Section 12 ("AI provider keys must never live
 * client-side; a backend/serverless layer proxies AI ... so provider keys
 * never live client-side"). No such backend is deployed yet in this MVP —
 * this class exists so the integration point is real and typed, and the
 * app never blocks on a missing API key: any network failure falls back to
 * the deterministic mock adapter automatically.
 */
export class RemoteLlmAdapter implements LlmAdapter {
  readonly name = 'remote-proxy'
  private readonly fallback = new MockLlmAdapter()
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async extractFromMessage(input: ExtractionInput): Promise<ExtractionResult> {
    try {
      const res = await fetch(`${this.baseUrl}/llm/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`Backend returned ${res.status}`)
      return (await res.json()) as ExtractionResult
    } catch (err) {
      console.warn('[RemoteLlmAdapter] falling back to mock adapter:', err)
      return this.fallback.extractFromMessage(input)
    }
  }

  async explainCareLevel(result: CareLevelResult): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/llm/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      })
      if (!res.ok) throw new Error(`Backend returned ${res.status}`)
      const data = (await res.json()) as { explanation: string }
      return data.explanation
    } catch (err) {
      console.warn('[RemoteLlmAdapter] falling back to mock adapter:', err)
      return this.fallback.explainCareLevel(result)
    }
  }
}
