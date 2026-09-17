import { describe, it, expect, vi, afterEach } from 'vitest'

describe('getLlmAdapter', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('constructs a LocalLlmAdapter pointed at the documented default base URL (http://127.0.0.1:11434) when VITE_OLLAMA_BASE_URL is unset', async () => {
    const { getLlmAdapter } = await import('./index')
    const { LocalLlmAdapter } = await import('./localLlmAdapter')
    const adapter = getLlmAdapter()
    expect(adapter).toBeInstanceOf(LocalLlmAdapter)

    const fetchSpy = vi.fn().mockRejectedValue(new TypeError('Ollama not running'))
    globalThis.fetch = fetchSpy
    await adapter.extractFromMessage({ message: 'hi', questionId: 'initial', relevantExistingFields: {} })
    expect(fetchSpy).toHaveBeenCalledWith('http://127.0.0.1:11434/api/chat', expect.any(Object))
  })

  it('returns the same cached instance on repeated calls', async () => {
    const { getLlmAdapter } = await import('./index')
    const a = getLlmAdapter()
    const b = getLlmAdapter()
    expect(a).toBe(b)
  })
})
