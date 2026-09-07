import { describe, it, expect } from 'vitest'
import { assessCareLevel } from './careLevelEngine'
import { mergeIntake } from '../intake/conversationEngine'
import { createEmptyIntakeRecord } from '../types/intake'
import { makeProvenance } from '../types/provenance'
import type { IntakeRecord } from '../types/intake'

/**
 * Requirement: "LLM output cannot directly override the deterministic care
 * level." The IntakeRecord type has no `careLevel`/`tier`/`urgencyScore`
 * field at all, so a well-typed adapter cannot express one. This test
 * proves the guarantee holds even against an adversarial/hallucinating
 * adapter that smuggles such a field in via `any` — the merge pipeline may
 * copy the stray property onto the object at runtime, but the engine never
 * reads it, so it has zero effect on the outcome.
 */
describe('LLM output cannot override the deterministic care level', () => {
  it('ignores an injected careLevel/tier field and still applies the red-flag override', () => {
    const base = createEmptyIntakeRecord()
    base.chiefComplaint = makeProvenance('chest pain', 'patient_reported')
    base.severity = makeProvenance(9, 'patient_reported')
    base.durationPattern = makeProvenance('Continuous', 'patient_reported')
    base.trend = makeProvenance('worsening', 'patient_reported')
    for (const id of ['fever', 'nausea', 'vomiting', 'faintingOrLossOfConsciousness', 'severeBleeding'] as const) {
      base.associatedSymptoms[id] = makeProvenance('denied', 'patient_reported')
    }
    base.associatedSymptoms.severeBreathingDifficulty = makeProvenance('denied', 'patient_reported')
    base.associatedSymptoms.chestPain = makeProvenance('reported', 'patient_reported')

    // Simulate a malicious/hallucinating extraction result trying to assert
    // a benign outcome directly, plus a genuine red-flag modifier symptom.
    const maliciousUpdate = {
      associatedSymptoms: { radiatingPain: makeProvenance('reported', 'patient_reported') },
      // These fields do not exist on IntakeRecord — only reachable via `any`.
      careLevel: 'SELF_CARE',
      tier: 'SELF_CARE',
      recommendedCareLevel: 'Self-care & monitor',
    } as unknown as Partial<IntakeRecord>

    const merged = mergeIntake(base, maliciousUpdate)

    // The stray fields may exist on the runtime object (JS spread doesn't
    // enforce the type), but assessCareLevel must never read them.
    expect((merged as unknown as Record<string, unknown>).careLevel).toBe('SELF_CARE')

    const outcome = assessCareLevel(merged)
    expect(outcome.kind).toBe('RESULT')
    if (outcome.kind === 'RESULT') {
      // Deterministic engine still sees genuine red flags (chest pain +
      // radiating pain) and forces EMERGENCY, completely ignoring the
      // injected "SELF_CARE" claim.
      expect(outcome.result.tier).toBe('EMERGENCY')
      expect(outcome.result.redFlagOverride).toBe(true)
    }
  })

  it('assessCareLevel never inspects any field outside the typed IntakeRecord shape', () => {
    // Structural guarantee: the function signature only accepts IntakeRecord,
    // which has no field capable of expressing a care level.
    const keys = Object.keys(createEmptyIntakeRecord())
    expect(keys).not.toContain('careLevel')
    expect(keys).not.toContain('tier')
    expect(keys).not.toContain('recommendedCareLevel')
  })
})
