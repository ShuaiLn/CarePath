import { describe, it, expect } from 'vitest'
import { resolveClarificationText } from './clarificationTemplates'
import { CLARIFICATION_REASONS, FIELD_IDS } from '../adapters/llm/types'

/**
 * Part 8.1-style exhaustiveness test: every (field, reason) pair the
 * extraction schema allows must resolve to a real, fixed sentence — an
 * allowed-but-unhandled combination must fail here, not silently render
 * blank/missing text to a user at runtime.
 */
describe('resolveClarificationText — exhaustive over every (field, reason) the schema allows', () => {
  for (const field of FIELD_IDS) {
    for (const reason of CLARIFICATION_REASONS) {
      it(`produces a real sentence for (${field}, ${reason})`, () => {
        const text = resolveClarificationText({ field, reason })
        expect(typeof text).toBe('string')
        expect(text.length).toBeGreaterThan(10)
        expect(text).not.toMatch(/undefined|\[object Object\]|NaN/)
      })
    }
  }

  it('never returns the same generic fallback for two different fields (spot check a few)', () => {
    const severity = resolveClarificationText({ field: 'severity', reason: 'unparseable' })
    const age = resolveClarificationText({ field: 'age', reason: 'unparseable' })
    const chestPain = resolveClarificationText({ field: 'associatedSymptoms.chestPain', reason: 'unparseable' })
    expect(new Set([severity, age, chestPain]).size).toBe(3)
  })

  it('is deterministic — the same input always produces the exact same sentence', () => {
    const a = resolveClarificationText({ field: 'trend', reason: 'hedged_uncertain' })
    const b = resolveClarificationText({ field: 'trend', reason: 'hedged_uncertain' })
    expect(a).toBe(b)
  })
})
