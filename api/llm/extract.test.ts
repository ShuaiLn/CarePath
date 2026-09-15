import { describe, it, expect, vi, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import handler from './extract'

function fakeRequest(method: string, jsonBody: unknown): IncomingMessage {
  const body = jsonBody === undefined ? '' : JSON.stringify(jsonBody)
  const readable = new Readable({
    read() {
      this.push(body)
      this.push(null)
    },
  })
  Object.assign(readable, { method })
  return readable as unknown as IncomingMessage
}

function fakeRawRequest(method: string, rawBody: string): IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(rawBody)
      this.push(null)
    },
  })
  Object.assign(readable, { method })
  return readable as unknown as IncomingMessage
}

function fakeResponse(): ServerResponse & { body: string; headers: Record<string, string> } {
  const headers: Record<string, string> = {}
  const res = {
    statusCode: 0,
    body: '',
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value
    },
    end(chunk?: string) {
      res.body = chunk ?? ''
    },
  }
  return res as unknown as ServerResponse & { body: string; headers: Record<string, string> }
}

function responsesBody(outputText: string) {
  return JSON.stringify({ status: 'completed', output_text: outputText })
}

describe('POST /api/llm/extract handler', () => {
  const originalFetch = globalThis.fetch
  const originalApiKey = process.env.OPENAI_API_KEY
  const originalModel = process.env.OPENAI_EXTRACTION_MODEL

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalApiKey
    if (originalModel === undefined) delete process.env.OPENAI_EXTRACTION_MODEL
    else process.env.OPENAI_EXTRACTION_MODEL = originalModel
    vi.restoreAllMocks()
  })

  it('rejects non-POST methods', async () => {
    const req = fakeRequest('GET', {})
    const res = fakeResponse()
    await handler(req, res)
    expect(res.statusCode).toBe(405)
  })

  it('rejects invalid JSON bodies', async () => {
    const req = fakeRawRequest('POST', '{not valid json')
    const res = fakeResponse()
    await handler(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('returns 503 (never crashes) when OPENAI_API_KEY is not configured, so the client falls back to its offline mock', async () => {
    delete process.env.OPENAI_API_KEY
    const req = fakeRequest('POST', { message: 'hi', questionId: 'initial', relevantExistingFields: {} })
    const res = fakeResponse()
    await handler(req, res)
    expect(res.statusCode).toBe(503)
  })

  it('rejects an oversized body before ever touching OpenAI (abuse prevention)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy
    const req = fakeRawRequest('POST', JSON.stringify({ message: 'a'.repeat(100000), questionId: 'initial' }))
    const res = fakeResponse()
    await handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('end-to-end success: valid request + working OpenAI backend -> 200 with a well-formed ExtractionResult', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        responsesBody(
          JSON.stringify({
            chiefComplaint: { value: 'chest pain', sourceText: 'chest pain' },
            location: null,
            severity: null,
            trend: null,
            durationPattern: null,
            onsetHours: null,
            age: null,
            associatedSymptoms: null,
            medicalConditions: null,
            currentMedications: null,
            allergies: null,
            scopeFlags: null,
            clarification: null,
          }),
        ),
        { status: 200 },
      ),
    )
    const req = fakeRequest('POST', { message: 'my chest hurts', questionId: 'initial', relevantExistingFields: {} })
    const res = fakeResponse()
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    const parsed = JSON.parse(res.body)
    expect(parsed.updatedIntake.chiefComplaint.value).toBe('chest pain')
    expect(parsed.extractionMode).toBe('remote')
  })

  it('never logs the raw message text or structured fields — only metadata (route, status, latency)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('server exploded', { status: 500 }))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const distinctiveMessage = 'a very specific and sensitive symptom description xyz123'
    const req = fakeRequest('POST', { message: distinctiveMessage, questionId: 'initial', relevantExistingFields: {} })
    const res = fakeResponse()
    await handler(req, res)

    for (const call of logSpy.mock.calls) {
      const serialized = JSON.stringify(call)
      expect(serialized).not.toMatch(/xyz123/)
      const parsedLog = JSON.parse(call[0] as string)
      expect(Object.keys(parsedLog).sort()).toEqual(['latencyMs', 'route', 'status'])
    }
    expect(logSpy).toHaveBeenCalled()
  })
})
