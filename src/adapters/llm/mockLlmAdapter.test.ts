import { describe, it, expect } from 'vitest'
import { MockLlmAdapter } from './mockLlmAdapter'
import { createEmptyIntakeRecord } from '../../types/intake'

describe('MockLlmAdapter.extractFromMessage', () => {
  const adapter = new MockLlmAdapter()

  it('extracts a chief complaint and severity from the initial free-text message', async () => {
    const result = await adapter.extractFromMessage({
      message: 'My stomach has been hurting for 3 days, about a 6/10.',
      questionId: 'initial',
      currentIntake: createEmptyIntakeRecord(),
    })
    expect(result.updatedIntake.chiefComplaint?.value).toMatch(/stomach/i)
    expect(result.updatedIntake.severity?.value).toBe(6)
    expect(result.updatedIntake.onsetHours?.value).toBe(72)
  })

  it('flags a critical red flag mentioned in free text even before its dedicated question is asked', async () => {
    const result = await adapter.extractFromMessage({
      message: "I can't breathe and my chest really hurts.",
      questionId: 'initial',
      currentIntake: createEmptyIntakeRecord(),
    })
    expect(result.updatedIntake.associatedSymptoms?.severeBreathingDifficulty?.value).toBe('reported')
    expect(result.updatedIntake.associatedSymptoms?.chestPain?.value).toBe('reported')
  })

  it('asks a clarifying question instead of guessing when severity is unparseable, with no numeric confidence anywhere in the result', async () => {
    const result = await adapter.extractFromMessage({
      message: 'kind of a lot I guess',
      questionId: 'severity',
      currentIntake: createEmptyIntakeRecord(),
    })
    expect(result.updatedIntake.severity).toBeUndefined()
    expect(result.needsClarification).toBeTruthy()
    expect(JSON.stringify(result)).not.toMatch(/confidence[":]/)
  })

  it('does not mark unmentioned screening symptoms as denied when the user only confirms one of them', async () => {
    const result = await adapter.extractFromMessage({
      message: 'I have a fever but nothing else.',
      questionId: 'moreScreeningSymptoms',
      currentIntake: createEmptyIntakeRecord(),
    })
    expect(result.updatedIntake.associatedSymptoms?.fever?.value).toBe('reported')
    expect(result.updatedIntake.associatedSymptoms?.nausea).toBeUndefined()
    expect(result.updatedIntake.associatedSymptoms?.vomiting).toBeUndefined()
  })

  it('marks all asked screening symptoms denied on a clear blanket "no"', async () => {
    const result = await adapter.extractFromMessage({
      message: 'no',
      questionId: 'screeningSymptoms',
      currentIntake: createEmptyIntakeRecord(),
    })
    expect(result.updatedIntake.associatedSymptoms?.chestPain?.value).toBe('denied')
    expect(result.updatedIntake.associatedSymptoms?.severeBreathingDifficulty?.value).toBe('denied')
  })

  it('does not let a later blanket "no" to the screening question overwrite a red flag already reported in free text', async () => {
    const initial = await adapter.extractFromMessage({
      message: 'I have chest pain and it is spreading to my arm.',
      questionId: 'initial',
      currentIntake: createEmptyIntakeRecord(),
    })
    expect(initial.updatedIntake.associatedSymptoms?.chestPain?.value).toBe('reported')

    const currentIntake = createEmptyIntakeRecord()
    currentIntake.associatedSymptoms = { ...initial.updatedIntake.associatedSymptoms }

    const followUp = await adapter.extractFromMessage({
      message: 'no',
      questionId: 'screeningSymptoms',
      currentIntake,
    })
    // The blanket "no" should fill in the OTHER screening symptoms as
    // denied, but must never flip the already-reported chest pain to denied.
    expect(followUp.updatedIntake.associatedSymptoms?.chestPain).toBeUndefined()
    expect(followUp.updatedIntake.associatedSymptoms?.severeBreathingDifficulty?.value).toBe('denied')
  })

  it('never returns a field that could be mistaken for a care-level decision', async () => {
    const result = await adapter.extractFromMessage({
      message: 'severe chest pain, 10/10, getting worse',
      questionId: 'initial',
      currentIntake: createEmptyIntakeRecord(),
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/careLevel/i)
    expect(serialized).not.toMatch(/urgencyScore/i)
    expect(serialized).not.toMatch(/tier/i)
  })
})
