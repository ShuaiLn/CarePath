import { describe, it, expect, vi } from 'vitest'
import { handleExtractRequest } from './extractHandler'
import { makeProvenance } from '../../src/types/provenance'
import type { IntakeRecord } from '../../src/types/intake'

function fakeOpenai(response: unknown, opts: { throws?: boolean } = {}) {
  return {
    extract: vi.fn(async () => {
      if (opts.throws) throw new Error('network exploded, message: "chest pain 10/10"')
      return response
    }),
  }
}

const validBody = {
  message: 'my chest hurts a lot',
  questionId: 'initial',
  relevantExistingFields: {},
}

function withSourceText<T>(value: T, sourceText = 'evidence') {
  return { value, sourceText }
}

describe('handleExtractRequest — request validation', () => {
  it('rejects a missing message', async () => {
    const res = await handleExtractRequest({ questionId: 'initial' }, { openai: fakeOpenai({}) })
    expect(res.status).toBe(400)
  })

  it('rejects an empty message', async () => {
    const res = await handleExtractRequest({ message: '   ', questionId: 'initial' }, { openai: fakeOpenai({}) })
    expect(res.status).toBe(400)
  })

  it('rejects a missing questionId', async () => {
    const res = await handleExtractRequest({ message: 'hi' }, { openai: fakeOpenai({}) })
    expect(res.status).toBe(400)
  })

  it('rejects an overly long message before ever calling OpenAI (abuse prevention)', async () => {
    const openai = fakeOpenai({})
    const res = await handleExtractRequest({ message: 'a'.repeat(5000), questionId: 'initial' }, { openai })
    expect(res.status).toBe(400)
    expect(openai.extract).not.toHaveBeenCalled()
  })

  it('rejects a non-object body', async () => {
    const res = await handleExtractRequest('not an object', { openai: fakeOpenai({}) })
    expect(res.status).toBe(400)
  })
})

describe('handleExtractRequest — upstream failure handling', () => {
  it('returns 502 without leaking the upstream error message (which may embed request content)', async () => {
    const res = await handleExtractRequest(validBody, { openai: fakeOpenai(null, { throws: true }) })
    expect(res.status).toBe(502)
    expect(JSON.stringify(res.body)).not.toMatch(/chest pain/i)
  })
})

describe('handleExtractRequest — model output validation (untrusted input, strict allowlist)', () => {
  const fullValidResponse = {
    chiefComplaint: withSourceText('chest pain'),
    location: null,
    severity: withSourceText(8),
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

  it('accepts a fully valid response and wraps every value in a patient_reported provenance envelope', async () => {
    const res = await handleExtractRequest(validBody, { openai: fakeOpenai(fullValidResponse) })
    expect(res.status).toBe(200)
    if (res.status !== 200) return
    const body = res.body as { updatedIntake: IntakeRecord; extractionMode: string }
    expect(body.updatedIntake.chiefComplaint?.value).toBe('chest pain')
    expect(body.updatedIntake.chiefComplaint?.source).toBe('patient_reported')
    expect(body.updatedIntake.chiefComplaint?.confirmedByUser).toBe(false)
    expect(body.updatedIntake.severity?.value).toBe(8)
    expect(body.extractionMode).toBe('remote')
  })

  it('rejects a response that smuggles a careLevel-shaped key at the top level (fail closed, not silently stripped)', async () => {
    const res = await handleExtractRequest(validBody, {
      openai: fakeOpenai({ ...fullValidResponse, careLevel: 'SELF_CARE' }),
    })
    expect(res.status).toBe(502)
  })

  it('rejects a response with a tier/urgencyScore/recommendedCareLevel-shaped key', async () => {
    for (const key of ['tier', 'urgencyScore', 'recommendedCareLevel', 'redFlagOverride', 'triggeredRedFlags']) {
      const res = await handleExtractRequest(validBody, {
        openai: fakeOpenai({ ...fullValidResponse, [key]: 'anything' }),
      })
      expect(res.status).toBe(502)
    }
  })

  it('rejects a value field missing its required sourceText evidence', async () => {
    const res = await handleExtractRequest(validBody, {
      openai: fakeOpenai({ ...fullValidResponse, chiefComplaint: { value: 'chest pain' } }),
    })
    expect(res.status).toBe(502)
  })

  it('rejects an out-of-range severity value', async () => {
    const res = await handleExtractRequest(validBody, {
      openai: fakeOpenai({ ...fullValidResponse, severity: withSourceText(15) }),
    })
    expect(res.status).toBe(502)
  })

  it('rejects an unrecognized associated-symptom id', async () => {
    const res = await handleExtractRequest(validBody, {
      openai: fakeOpenai({ ...fullValidResponse, associatedSymptoms: { notARealSymptom: withSourceText('reported') } }),
    })
    expect(res.status).toBe(502)
  })

  it('passes through a valid structured clarification signal', async () => {
    const res = await handleExtractRequest(validBody, {
      openai: fakeOpenai({ ...fullValidResponse, clarification: { field: 'severity', reason: 'hedged_uncertain' } }),
    })
    expect(res.status).toBe(200)
    if (res.status !== 200) return
    expect((res.body as { clarification: unknown }).clarification).toEqual({ field: 'severity', reason: 'hedged_uncertain' })
  })

  it('rejects a clarification with a reason outside the fixed enum (no free-text reason smuggled in)', async () => {
    const res = await handleExtractRequest(validBody, {
      openai: fakeOpenai({ ...fullValidResponse, clarification: { field: 'severity', reason: "it's probably nothing serious" } }),
    })
    expect(res.status).toBe(502)
  })

  it('rejects a clarification field outside the closed FieldId enum', async () => {
    const res = await handleExtractRequest(validBody, {
      openai: fakeOpenai({ ...fullValidResponse, clarification: { field: 'diagnosis', reason: 'ambiguous_value' } }),
    })
    expect(res.status).toBe(502)
  })

  it('rejects malformed JSON shape entirely (e.g. a string instead of an object)', async () => {
    const res = await handleExtractRequest(validBody, { openai: fakeOpenai('just a string') })
    expect(res.status).toBe(502)
  })
})

describe('handleExtractRequest — never lets this turn silently downgrade an already-reported red flag or scope flag', () => {
  const baseResponse = {
    chiefComplaint: null,
    location: null,
    severity: null,
    trend: null,
    durationPattern: null,
    onsetHours: null,
    age: null,
    medicalConditions: null,
    currentMedications: null,
    allergies: null,
    clarification: null,
  }

  it('drops an associatedSymptoms id the model reports as "denied" when relevantExistingFields already had it "reported"', async () => {
    const body = {
      message: 'no, none of that',
      questionId: 'screeningSymptoms',
      relevantExistingFields: { associatedSymptoms: { chestPain: makeProvenance('reported', 'patient_reported') } },
    }
    const res = await handleExtractRequest(body, {
      openai: fakeOpenai({
        ...baseResponse,
        associatedSymptoms: { chestPain: withSourceText('denied') },
        scopeFlags: null,
      }),
    })
    expect(res.status).toBe(200)
    if (res.status !== 200) return
    expect((res.body as { updatedIntake: IntakeRecord }).updatedIntake.associatedSymptoms?.chestPain).toBeUndefined()
  })

  it('still allows a genuinely new "reported" for a different id in the same turn', async () => {
    const body = {
      message: 'no chest pain, but I do have a fever',
      questionId: 'screeningSymptoms',
      relevantExistingFields: { associatedSymptoms: { chestPain: makeProvenance('reported', 'patient_reported') } },
    }
    const res = await handleExtractRequest(body, {
      openai: fakeOpenai({
        ...baseResponse,
        associatedSymptoms: { chestPain: withSourceText('denied'), fever: withSourceText('reported') },
        scopeFlags: null,
      }),
    })
    expect(res.status).toBe(200)
    if (res.status !== 200) return
    const updated = (res.body as { updatedIntake: IntakeRecord }).updatedIntake
    expect(updated.associatedSymptoms?.chestPain).toBeUndefined()
    expect(updated.associatedSymptoms?.fever?.value).toBe('reported')
  })

  it('drops a scope flag (e.g. mental health crisis) the model reports as "denied" when it was already "reported"', async () => {
    const body = {
      message: 'no',
      questionId: 'scopeCheck',
      relevantExistingFields: { mentalHealthCrisisReported: makeProvenance('reported', 'patient_reported') },
    }
    const res = await handleExtractRequest(body, {
      openai: fakeOpenai({
        ...baseResponse,
        associatedSymptoms: null,
        scopeFlags: { mentalHealthCrisis: withSourceText('denied') },
      }),
    })
    expect(res.status).toBe(200)
    if (res.status !== 200) return
    expect((res.body as { updatedIntake: IntakeRecord }).updatedIntake.mentalHealthCrisisReported).toBeUndefined()
  })

  it('allows upgrading from unknown to reported with no prior evidence required', async () => {
    const res = await handleExtractRequest(validBody, {
      openai: fakeOpenai({
        ...baseResponse,
        associatedSymptoms: { chestPain: withSourceText('reported') },
        scopeFlags: null,
      }),
    })
    expect(res.status).toBe(200)
    if (res.status !== 200) return
    expect((res.body as { updatedIntake: IntakeRecord }).updatedIntake.associatedSymptoms?.chestPain?.value).toBe('reported')
  })
})

/**
 * Fixture-driven extraction-phrase tests (docs plan Part 8.2), run against
 * a fake/injectable OpenAI client so CI needs no live API calls. These
 * exercise the validation/mapping pipeline against the JSON a well-behaved
 * model should produce for each phrase — not the model's own NLU, which
 * isn't testable offline.
 */
describe('handleExtractRequest — extraction phrase fixtures', () => {
  const empty = {
    chiefComplaint: null,
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

  it('"I don\'t have chest pain" -> chestPain denied', async () => {
    const res = await handleExtractRequest(
      { message: "I don't have chest pain", questionId: 'screeningSymptoms', relevantExistingFields: {} },
      { openai: fakeOpenai({ ...empty, associatedSymptoms: { chestPain: withSourceText('denied', "don't have chest pain") } }) },
    )
    expect(res.status).toBe(200)
    if (res.status !== 200) return
    expect((res.body as { updatedIntake: IntakeRecord }).updatedIntake.associatedSymptoms?.chestPain?.value).toBe('denied')
  })

  it('"I\'m not sure if it counts as dizziness" -> a structured hedged_uncertain clarification, never a free-text question', async () => {
    const res = await handleExtractRequest(
      { message: "I'm not sure if it counts as dizziness", questionId: 'moreScreeningSymptoms', relevantExistingFields: {} },
      {
        openai: fakeOpenai({
          ...empty,
          clarification: { field: 'associatedSymptoms.severeConfusion', reason: 'hedged_uncertain' },
        }),
      },
    )
    expect(res.status).toBe(200)
    if (res.status !== 200) return
    const clarification = (res.body as { clarification: { field: string; reason: string } | null }).clarification
    expect(clarification).toEqual({ field: 'associatedSymptoms.severeConfusion', reason: 'hedged_uncertain' })
  })

  it('"My doctor said it might be reflux" -> no diagnostic speculation extracted into any field', async () => {
    const res = await handleExtractRequest(
      { message: 'My doctor said it might be reflux', questionId: 'initial', relevantExistingFields: {} },
      { openai: fakeOpenai({ ...empty, chiefComplaint: withSourceText('stomach pain', 'stomach pain') }) },
    )
    expect(res.status).toBe(200)
    if (res.status !== 200) return
    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toMatch(/reflux/i)
  })

  it('"I think the pain is around a 6, maybe 7" -> a single severity value, hedge captured only in sourceText (not lost, not turned into a numeric confidence)', async () => {
    const res = await handleExtractRequest(
      { message: 'I think the pain is around a 6, maybe 7', questionId: 'severity', relevantExistingFields: {} },
      { openai: fakeOpenai({ ...empty, severity: withSourceText(6, 'around a 6, maybe 7') }) },
    )
    expect(res.status).toBe(200)
    if (res.status !== 200) return
    expect((res.body as { updatedIntake: IntakeRecord }).updatedIntake.severity?.value).toBe(6)
    expect(JSON.stringify(res.body)).not.toMatch(/confidence[":]/)
  })
})
