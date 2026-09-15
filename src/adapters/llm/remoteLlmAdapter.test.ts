import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RemoteLlmAdapter } from './remoteLlmAdapter'
import type { ExtractionContext } from './types'
import type { CareLevelResult } from '../../types/careLevel'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const baseInput: ExtractionContext = {
  message: 'my chest hurts',
  questionId: 'initial',
  relevantExistingFields: {},
}

const validBackendResult = {
  updatedIntake: { chiefComplaint: { value: 'chest hurts', source: 'patient_reported', confirmedByUser: false, capturedAt: '2026-01-01T00:00:00.000Z' } },
  clarification: null,
  extractionMode: 'remote',
}

describe('RemoteLlmAdapter.extractFromMessage', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns the backend result, marked extractionMode "remote", on a successful call', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, validBackendResult))
    const adapter = new RemoteLlmAdapter()
    const result = await adapter.extractFromMessage(baseInput)
    expect(result.extractionMode).toBe('remote')
    expect(result.updatedIntake.chiefComplaint?.value).toBe('chest hurts')
  })

  it('calls the same-origin relative path by default (no baseUrl configured)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, validBackendResult))
    globalThis.fetch = fetchSpy
    const adapter = new RemoteLlmAdapter()
    await adapter.extractFromMessage(baseInput)
    expect(fetchSpy).toHaveBeenCalledWith('/api/llm/extract', expect.any(Object))
  })

  it('prefixes the configured base URL when one is provided (split-deployment case)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, validBackendResult))
    globalThis.fetch = fetchSpy
    const adapter = new RemoteLlmAdapter('https://backend.example.com')
    await adapter.extractFromMessage(baseInput)
    expect(fetchSpy).toHaveBeenCalledWith('https://backend.example.com/api/llm/extract', expect.any(Object))
  })

  it('sends only message, questionId, and relevantExistingFields — never a full case dump or user identity (data minimization)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, validBackendResult))
    globalThis.fetch = fetchSpy
    const adapter = new RemoteLlmAdapter()
    await adapter.extractFromMessage(baseInput)
    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body as string)
    expect(Object.keys(sentBody).sort()).toEqual(['message', 'questionId', 'relevantExistingFields'])
  })

  it('falls back to the offline mock on a non-2xx response, and marks extractionMode "local-fallback"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(503, { error: 'llm_backend_unavailable' }))
    const adapter = new RemoteLlmAdapter()
    const result = await adapter.extractFromMessage(baseInput)
    expect(result.extractionMode).toBe('local-fallback')
  })

  it('falls back to the offline mock on a network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const adapter = new RemoteLlmAdapter()
    const result = await adapter.extractFromMessage(baseInput)
    expect(result.extractionMode).toBe('local-fallback')
  })

  it('falls back to the offline mock when the response body is not valid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }))
    const adapter = new RemoteLlmAdapter()
    const result = await adapter.extractFromMessage(baseInput)
    expect(result.extractionMode).toBe('local-fallback')
  })

  it('falls back to the offline mock when the response is well-formed JSON but the wrong shape (defense in depth on an untrusted network boundary)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { unexpected: true }))
    const adapter = new RemoteLlmAdapter()
    const result = await adapter.extractFromMessage(baseInput)
    expect(result.extractionMode).toBe('local-fallback')
  })

  it('strips any key not in the IntakeRecord allowlist from updatedIntake — e.g. an injected careLevel/tier field never enters application state', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        updatedIntake: {
          chiefComplaint: { value: 'chest hurts', source: 'patient_reported', confirmedByUser: false, capturedAt: '2026-01-01T00:00:00.000Z' },
          careLevel: 'SELF_CARE',
          tier: 'SELF_CARE',
          urgencyScore: 3,
        },
        clarification: null,
        extractionMode: 'remote',
      }),
    )
    const adapter = new RemoteLlmAdapter()
    const result = await adapter.extractFromMessage(baseInput)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/careLevel/i)
    expect(serialized).not.toMatch(/urgencyScore/i)
    expect(result.updatedIntake.chiefComplaint?.value).toBe('chest hurts')
  })

  it('times out and falls back to the offline mock rather than hanging "isThinking" indefinitely', async () => {
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

    const adapter = new RemoteLlmAdapter()
    const promise = adapter.extractFromMessage(baseInput)
    await vi.advanceTimersByTimeAsync(20000)
    const result = await promise
    expect(result.extractionMode).toBe('local-fallback')
  })
})

describe('RemoteLlmAdapter.explainCareLevel', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const careLevelResult: CareLevelResult = {
    tier: 'SAME_DAY_URGENT',
    redFlagOverride: false,
    triggeredRedFlags: [],
    factors: [{ id: 'severity', label: 'Severity', detail: 'Reported pain/severity 7/10' }],
    internalScore: 74,
  }

  it('never makes a network call — stays on the deterministic template for v1, so internalScore structurally never leaves the client', async () => {
    const adapter = new RemoteLlmAdapter()
    const explanation = await adapter.explainCareLevel(careLevelResult)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(explanation).not.toMatch(/\b74\b/)
    expect(explanation).not.toMatch(/internalScore/i)
  })
})
