import { describe, it, expect, vi, afterEach } from 'vitest'
import { createOllamaExtractionClient } from './ollamaClient'

function chatResponseBody(content: string) {
  return { message: { role: 'assistant', content }, done: true }
}

const LOOPBACK_URL = 'http://127.0.0.1:11434'
const request = { message: 'hi', questionId: 'initial', relevantExistingFields: {} }

describe('createOllamaExtractionClient', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('parses JSON out of message.content on a successful response', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(chatResponseBody(JSON.stringify({ chiefComplaint: { value: 'x', sourceText: 'x' } }))), { status: 200 }))
    const client = createOllamaExtractionClient(LOOPBACK_URL)
    const result = await client.extract(request)
    expect(result).toEqual({ chiefComplaint: { value: 'x', sourceText: 'x' } })
  })

  it('sends no Authorization header — Ollama requires no API key', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(chatResponseBody('{}')), { status: 200 }))
    globalThis.fetch = fetchSpy
    const client = createOllamaExtractionClient(LOOPBACK_URL)
    await client.extract(request)
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('posts to <baseUrl>/api/chat with the extraction JSON schema as the format field, non-streaming', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(chatResponseBody('{}')), { status: 200 }))
    globalThis.fetch = fetchSpy
    const client = createOllamaExtractionClient(LOOPBACK_URL)
    await client.extract(request)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${LOOPBACK_URL}/api/chat`)
    const body = JSON.parse(init.body as string)
    expect(body.stream).toBe(false)
    expect(body.format.additionalProperties).toBe(false)
  })

  it('refuses to call a non-loopback base URL — zero fetch calls (defense in depth alongside LocalLlmAdapter)', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy
    const client = createOllamaExtractionClient('https://my-ollama.example.com')
    await expect(client.extract(request)).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws when the response has no message content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ done: true }), { status: 200 }))
    const client = createOllamaExtractionClient(LOOPBACK_URL)
    await expect(client.extract(request)).rejects.toThrow()
  })

  it('throws when the message content is not valid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(chatResponseBody('not json')), { status: 200 }))
    const client = createOllamaExtractionClient(LOOPBACK_URL)
    await expect(client.extract(request)).rejects.toThrow()
  })

  it('retries once on a transient network error, then succeeds', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(new Response(JSON.stringify(chatResponseBody('{}')), { status: 200 }))
    globalThis.fetch = fetchSpy
    const client = createOllamaExtractionClient(LOOPBACK_URL)
    await expect(client.extract(request)).resolves.toEqual({})
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('retries once on a transient 5xx, then succeeds', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('server error', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(chatResponseBody('{}')), { status: 200 }))
    globalThis.fetch = fetchSpy
    const client = createOllamaExtractionClient(LOOPBACK_URL)
    await expect(client.extract(request)).resolves.toEqual({})
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not retry on a 4xx (bad request/schema error) — fails immediately', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }))
    globalThis.fetch = fetchSpy
    const client = createOllamaExtractionClient(LOOPBACK_URL)
    await expect(client.extract(request)).rejects.toThrow()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('gives up after one retry if the 5xx persists', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('server error', { status: 503 }))
    globalThis.fetch = fetchSpy
    const client = createOllamaExtractionClient(LOOPBACK_URL)
    await expect(client.extract(request)).rejects.toThrow()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('times out a hanging attempt via AbortController rather than hanging indefinitely', async () => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    }) as unknown as typeof fetch
    const client = createOllamaExtractionClient(LOOPBACK_URL)
    const promise = client.extract(request)
    promise.catch(() => {})
    await vi.advanceTimersByTimeAsync(25000)
    await expect(promise).rejects.toThrow()
  })
})
