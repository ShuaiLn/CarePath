import { describe, it, expect } from 'vitest'
import { MockLlmAdapter } from './mockLlmAdapter'
import { makeProvenance } from '../../types/provenance'

describe('MockLlmAdapter.extractFromMessage', () => {
  const adapter = new MockLlmAdapter()

  it('extracts a chief complaint and severity from the initial free-text message', async () => {
    const result = await adapter.extractFromMessage({
      message: 'My stomach has been hurting for 3 days, about a 6/10.',
      questionId: 'initial',
      relevantExistingFields: {},
    })
    expect(result.updatedIntake.chiefComplaint?.value).toMatch(/stomach/i)
    expect(result.updatedIntake.severity?.value).toBe(6)
    expect(result.updatedIntake.onsetHours?.value).toBe(72)
  })

  it('flags a critical red flag mentioned in free text even before its dedicated question is asked', async () => {
    const result = await adapter.extractFromMessage({
      message: "I can't breathe and my chest really hurts.",
      questionId: 'initial',
      relevantExistingFields: {},
    })
    expect(result.updatedIntake.associatedSymptoms?.severeBreathingDifficulty?.value).toBe('reported')
    expect(result.updatedIntake.associatedSymptoms?.chestPain?.value).toBe('reported')
  })

  it('asks a clarifying question instead of guessing when severity is unparseable, with no numeric confidence anywhere in the result', async () => {
    const result = await adapter.extractFromMessage({
      message: 'kind of a lot I guess',
      questionId: 'severity',
      relevantExistingFields: {},
    })
    expect(result.updatedIntake.severity).toBeUndefined()
    expect(result.clarification).toEqual({ field: 'severity', reason: 'unparseable' })
    expect(JSON.stringify(result)).not.toMatch(/confidence[":]/)
  })

  it('does not mark unmentioned screening symptoms as denied when the user only confirms one of them', async () => {
    const result = await adapter.extractFromMessage({
      message: 'I have a fever but nothing else.',
      questionId: 'moreScreeningSymptoms',
      relevantExistingFields: {},
    })
    expect(result.updatedIntake.associatedSymptoms?.fever?.value).toBe('reported')
    expect(result.updatedIntake.associatedSymptoms?.nausea).toBeUndefined()
    expect(result.updatedIntake.associatedSymptoms?.vomiting).toBeUndefined()
  })

  it('marks all asked screening symptoms denied on a clear blanket "no"', async () => {
    const result = await adapter.extractFromMessage({
      message: 'no',
      questionId: 'screeningSymptoms',
      relevantExistingFields: {},
    })
    expect(result.updatedIntake.associatedSymptoms?.chestPain?.value).toBe('denied')
    expect(result.updatedIntake.associatedSymptoms?.severeBreathingDifficulty?.value).toBe('denied')
  })

  it('does not let a later blanket "no" to the screening question overwrite a red flag already reported in free text', async () => {
    const initial = await adapter.extractFromMessage({
      message: 'I have chest pain and it is spreading to my arm.',
      questionId: 'initial',
      relevantExistingFields: {},
    })
    expect(initial.updatedIntake.associatedSymptoms?.chestPain?.value).toBe('reported')

    // What selectRelevantContext would compute for the 'screeningSymptoms'
    // question given that prior turn — see conversationEngine.test.ts for
    // the selector itself.
    const relevantExistingFields = { associatedSymptoms: { ...initial.updatedIntake.associatedSymptoms } }

    const followUp = await adapter.extractFromMessage({
      message: 'no',
      questionId: 'screeningSymptoms',
      relevantExistingFields,
    })
    // The blanket "no" should fill in the OTHER screening symptoms as
    // denied, but must never flip the already-reported chest pain to denied.
    expect(followUp.updatedIntake.associatedSymptoms?.chestPain).toBeUndefined()
    expect(followUp.updatedIntake.associatedSymptoms?.severeBreathingDifficulty?.value).toBe('denied')
  })

  it('does not let a later blanket "no" to the scope-check question overwrite a scope flag already reported', async () => {
    const relevantExistingFields = { traumaInjuryReported: makeProvenance('reported' as const, 'patient_reported') }
    const result = await adapter.extractFromMessage({
      message: 'no',
      questionId: 'scopeCheck',
      relevantExistingFields,
    })
    expect(result.updatedIntake.traumaInjuryReported).toBeUndefined()
    expect(result.updatedIntake.poisoningExposureReported?.value).toBe('denied')
  })

  it('never guesses "denied" for a field it has no evidence about — only an explicit blanket "no" produces denied, and unmentioned fields stay unset (never silently denied)', async () => {
    const result = await adapter.extractFromMessage({
      message: 'I guess maybe not sure',
      questionId: 'moreScreeningSymptoms',
      relevantExistingFields: {},
    })
    // Not a recognized blanket "no" phrase, so nothing should be denied —
    // and definitely nothing should be denied without the field ever being
    // mentioned.
    expect(result.updatedIntake.associatedSymptoms?.fever).toBeUndefined()
    expect(result.updatedIntake.associatedSymptoms?.nausea).toBeUndefined()
    expect(result.updatedIntake.associatedSymptoms?.vomiting).toBeUndefined()
  })

  it('always reports which extraction path produced the result', async () => {
    const result = await adapter.extractFromMessage({
      message: 'no',
      questionId: 'screeningSymptoms',
      relevantExistingFields: {},
    })
    expect(result.extractionMode).toBe('local-fallback')
  })

  it('never returns a field that could be mistaken for a care-level decision', async () => {
    const result = await adapter.extractFromMessage({
      message: 'severe chest pain, 10/10, getting worse',
      questionId: 'initial',
      relevantExistingFields: {},
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/careLevel/i)
    expect(serialized).not.toMatch(/urgencyScore/i)
    expect(serialized).not.toMatch(/tier/i)
  })

  it('never returns a clarification as a free-text string — only the structured {field, reason} signal', async () => {
    const result = await adapter.extractFromMessage({
      message: 'kind of a lot I guess',
      questionId: 'severity',
      relevantExistingFields: {},
    })
    expect(result.clarification).not.toBeNull()
    expect(typeof result.clarification?.field).toBe('string')
    expect(typeof result.clarification?.reason).toBe('string')
  })
})

describe('MockLlmAdapter.explainCareLevel', () => {
  it('never mentions the internal numeric score', async () => {
    const adapter = new MockLlmAdapter()
    const explanation = await adapter.explainCareLevel({
      tier: 'SAME_DAY_URGENT',
      redFlagOverride: false,
      triggeredRedFlags: [],
      factors: [{ id: 'severity', label: 'Severity', detail: 'Reported pain/severity 7/10' }],
      internalScore: 74,
    })
    expect(explanation).not.toMatch(/\b74\b/)
    expect(explanation).not.toMatch(/internalScore/i)
  })
})
