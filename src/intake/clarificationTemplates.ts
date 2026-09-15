import type { Clarification, ClarificationReason, FieldId } from '../adapters/llm/types'
import { ASSOCIATED_SYMPTOM_LABELS } from '../types/intake'

/**
 * The single place that turns a model's structured `{ field, reason }`
 * signal into the sentence a user actually reads. This is deterministic on
 * purpose — see docs on Clarification in adapters/llm/types.ts: OpenAI
 * decides *that* something was ambiguous and roughly *why*; this table
 * decides the exact words, so a model can never author user-facing prose.
 */

const SCOPE_FLAG_LABELS: Record<string, string> = {
  pregnancy: 'whether you might be pregnant',
  mentalHealthCrisis: 'the mental health concern you mentioned',
  poisoning: 'the possible poisoning or overdose you mentioned',
  trauma: 'the injury or accident you mentioned',
  sexualHealth: 'the sexual health concern you mentioned',
  postOperative: 'the recent surgery or procedure you mentioned',
  immunocompromised: 'your immune system status',
}

const TOP_LEVEL_FIELD_LABELS: Record<string, string> = {
  chiefComplaint: "what's going on",
  location: 'where the problem is',
  severity: 'how severe it is, on a scale of 0 to 10',
  trend: "whether it's getting better, staying the same, or getting worse",
  durationPattern: "whether it's constant or comes and goes",
  onsetHours: 'when this started',
  age: 'your age',
  medicalConditions: 'your ongoing medical conditions',
  currentMedications: 'your current medications',
  allergies: 'your allergies',
  screeningSymptoms: 'which of those symptoms apply to you',
  moreScreeningSymptoms: 'which of those apply to you',
}

/** Total over FieldId: every id resolves to a human-readable phrase. */
function fieldLabel(field: FieldId): string {
  if (field.startsWith('associatedSymptoms.')) {
    const id = field.slice('associatedSymptoms.'.length) as keyof typeof ASSOCIATED_SYMPTOM_LABELS
    return ASSOCIATED_SYMPTOM_LABELS[id]?.toLowerCase() ?? 'that symptom'
  }
  if (field.startsWith('scopeFlags.')) {
    const id = field.slice('scopeFlags.'.length)
    return SCOPE_FLAG_LABELS[id] ?? 'that'
  }
  return TOP_LEVEL_FIELD_LABELS[field] ?? 'that'
}

/** Total over ClarificationReason (enforced by the Record<> type). */
const REASON_TEMPLATES: Record<ClarificationReason, (label: string) => string> = {
  ambiguous_value: (label) => `I'm not sure I understood ${label} — could you clarify?`,
  multiple_values: (label) => `It sounds like there might be more than one answer for ${label} — can you tell me specifically which one(s) apply?`,
  unparseable: (label) => `I didn't quite catch ${label} — could you say that a different way?`,
  hedged_uncertain: (label) => `You sounded unsure about ${label} — could you confirm as best you can?`,
  contradicts_prior: (label) => `That seems different from what you told me earlier about ${label} — can you clarify which is correct?`,
}

/**
 * Resolve a structured clarification signal to the exact sentence shown to
 * the user. This is the ONLY code path allowed to produce that sentence —
 * see the Part 8.1-style test in clarificationTemplates.test.ts asserting
 * every (field, reason) combination the schema allows resolves here.
 */
export function resolveClarificationText(clarification: Clarification): string {
  const label = fieldLabel(clarification.field)
  return REASON_TEMPLATES[clarification.reason](label)
}
