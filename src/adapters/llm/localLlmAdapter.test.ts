import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LocalLlmAdapter, sanitizeUpdatedIntake } from './localLlmAdapter'
import type { ExtractionContext } from './types'
import type { CareLevelResult } from '../../types/careLevel'
import type { IntakeRecord } from '../../types/intake'
import { makeProvenance } from '../../types/provenance'

function chatResponse(status: number, rawContent: unknown): Response {
  return new Response(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify(rawContent) }, done: true }), { status })
}

const LOOPBACK_URL = 'http://127.0.0.1:11434'

const baseInput: ExtractionContext = {
  message: 'my chest hurts',
  questionId: 'initial',
  relevantExistingFields: {},
}

const fullValidRaw = {
  chiefComplaint: { value: 'chest hurts', sourceText: 'chest hurts' },
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
}

describe('LocalLlmAdapter.extractFromMessage', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns the parsed result marked extractionMode "local-llm" on a successful Ollama call', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(chatResponse(200, fullValidRaw))
    const adapter = new LocalLlmAdapter(LOOPBACK_URL)
    const result = await adapter.extractFromMessage(baseInput)
    expect(result.extractionMode).toBe('local-llm')
    expect(result.updatedIntake.chiefComplaint?.value).toBe('chest hurts')
  })

  it('falls back to the offline mock on a non-2xx response, marked "local-fallback"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('server error', { status: 500 }))
    const adapter = new LocalLlmAdapter(LOOPBACK_URL)
    const result = await adapter.extractFromMessage(baseInput)
    expect(result.extractionMode).toBe('local-fallback')
  })

  it('falls back to the offline mock on a network error (e.g. Ollama not running)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const adapter = new LocalLlmAdapter(LOOPBACK_URL)
    const result = await adapter.extractFromMessage(baseInput)
    expect(result.extractionMode).toBe('local-fallback')
  })

  it('falls back to the offline mock when the model output fails schema validation (e.g. a smuggled careLevel key)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(chatResponse(200, { ...fullValidRaw, careLevel: 'SELF_CARE' }))
    const adapter = new LocalLlmAdapter(LOOPBACK_URL)
    const result = await adapter.extractFromMessage(baseInput)
    expect(result.extractionMode).toBe('local-fallback')
  })

  it('falls back to the offline mock when the message content is not valid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: 'not json' } }), { status: 200 }))
    const adapter = new LocalLlmAdapter(LOOPBACK_URL)
    const result = await adapter.extractFromMessage(baseInput)
    expect(result.extractionMode).toBe('local-fallback')
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

    const adapter = new LocalLlmAdapter(LOOPBACK_URL)
    const promise = adapter.extractFromMessage(baseInput)
    await vi.advanceTimersByTimeAsync(25000)
    const result = await promise
    expect(result.extractionMode).toBe('local-fallback')
  })

  it('constructing with a non-loopback baseUrl falls back immediately — zero fetch calls ever made', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy
    const adapter = new LocalLlmAdapter('https://my-ollama.example.com')
    const result = await adapter.extractFromMessage(baseInput)
    expect(result.extractionMode).toBe('local-fallback')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('LocalLlmAdapter.explainCareLevel', () => {
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

  it('never makes a network call — stays on the deterministic template, so internalScore structurally never leaves the client', async () => {
    const adapter = new LocalLlmAdapter(LOOPBACK_URL)
    const explanation = await adapter.explainCareLevel(careLevelResult)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(explanation).not.toMatch(/\b74\b/)
    expect(explanation).not.toMatch(/internalScore/i)
  })
})

describe('sanitizeUpdatedIntake (allowlist defense-in-depth)', () => {
  it('drops any key not on the IntakeRecord allowlist, e.g. an injected careLevel/tier/urgencyScore field', () => {
    const input = {
      chiefComplaint: makeProvenance('chest hurts', 'patient_reported'),
      careLevel: makeProvenance('SELF_CARE', 'patient_reported'),
      tier: makeProvenance('SELF_CARE', 'patient_reported'),
      urgencyScore: makeProvenance(3, 'patient_reported'),
    } as unknown as Partial<IntakeRecord>
    const out = sanitizeUpdatedIntake(input)
    const serialized = JSON.stringify(out)
    expect(serialized).not.toMatch(/careLevel/i)
    expect(serialized).not.toMatch(/urgencyScore/i)
    expect(out.chiefComplaint?.value).toBe('chest hurts')
  })
})
