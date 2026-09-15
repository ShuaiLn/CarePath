import { describe, it, expect, vi, afterEach } from 'vitest'
import { createOpenAIExtractionClient } from './openaiClient'

function responsesBody(outputText: string, status = 'completed') {
  return { status, output_text: outputText }
}

const request = { message: 'hi', questionId: 'initial', relevantExistingFields: {} }

describe('createOpenAIExtractionClient', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('parses JSON out of output_text on a successful response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responsesBody(JSON.stringify({ chiefComplaint: { value: 'x', sourceText: 'x' } }))), { status: 200 }),
    )
    const client = createOpenAIExtractionClient('sk-test')
    const result = await client.extract(request)
    expect(result).toEqual({ chiefComplaint: { value: 'x', sourceText: 'x' } })
  })

  it('parses JSON out of a nested output[].content[] item when output_text is absent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ severity: null }) }] }],
        }),
        { status: 200 },
      ),
    )
    const client = createOpenAIExtractionClient('sk-test')
    const result = await client.extract(request)
    expect(result).toEqual({ severity: null })
  })

  it('sends the API key as a Bearer token and never in the URL/query string', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(responsesBody('{}')), { status: 200 }))
    globalThis.fetch = fetchSpy
    const client = createOpenAIExtractionClient('sk-secret-value')
    await client.extract(request)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).not.toMatch(/sk-secret-value/)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-secret-value')
  })

  it('sends a strict Structured Outputs JSON schema request', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(responsesBody('{}')), { status: 200 }))
    globalThis.fetch = fetchSpy
    const client = createOpenAIExtractionClient('sk-test')
    await client.extract(request)
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.text.format.type).toBe('json_schema')
    expect(body.text.format.strict).toBe(true)
    expect(body.text.format.schema.additionalProperties).toBe(false)
  })

  it('throws on a refusal instead of returning the refusal text as data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'cannot help' }] }] }),
        { status: 200 },
      ),
    )
    const client = createOpenAIExtractionClient('sk-test')
    await expect(client.extract(request)).rejects.toThrow()
  })

  it('throws when the response status is not "completed"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(responsesBody('{}', 'incomplete')), { status: 200 }))
    const client = createOpenAIExtractionClient('sk-test')
    await expect(client.extract(request)).rejects.toThrow()
  })

  it('throws when the output text is not valid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(responsesBody('not json')), { status: 200 }))
    const client = createOpenAIExtractionClient('sk-test')
    await expect(client.extract(request)).rejects.toThrow()
  })

  it('retries once on a transient network error, then succeeds', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(new Response(JSON.stringify(responsesBody('{}')), { status: 200 }))
    globalThis.fetch = fetchSpy
    const client = createOpenAIExtractionClient('sk-test')
    await expect(client.extract(request)).resolves.toEqual({})
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('retries once on a transient 5xx, then succeeds', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('server error', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(responsesBody('{}')), { status: 200 }))
    globalThis.fetch = fetchSpy
    const client = createOpenAIExtractionClient('sk-test')
    await expect(client.extract(request)).resolves.toEqual({})
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not retry on a 4xx (bad request/schema error) — fails immediately', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }))
    globalThis.fetch = fetchSpy
    const client = createOpenAIExtractionClient('sk-test')
    await expect(client.extract(request)).rejects.toThrow()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('gives up after one retry if the 5xx persists', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('server error', { status: 503 }))
    globalThis.fetch = fetchSpy
    const client = createOpenAIExtractionClient('sk-test')
    await expect(client.extract(request)).rejects.toThrow()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
