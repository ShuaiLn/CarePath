import type { Provenance, ReportStatus } from './provenance'

/**
 * Checklist of associated symptoms CarePath asks about. Includes both
 * general associated symptoms and the symptoms the deterministic red-flag
 * and scope engines key off of. Every entry is tracked as a Reported/
 * Denied/Unknown tri-state — never a plain boolean.
 */
export const ASSOCIATED_SYMPTOM_IDS = [
  'fever',
  'nausea',
  'vomiting',
  'severeBreathingDifficulty',
  'chestPain',
  'radiatingPain',
  'sweatingWithChestPain',
  'faintingOrLossOfConsciousness',
  'severeBleeding',
  'strokeSigns',
  'severeConfusion',
  'throatSwelling',
  'bloodInStoolOrVomit',
  'unableToKeepFluidsDown',
  'severeHeadacheWorstOfLife',
] as const

export type AssociatedSymptomId = (typeof ASSOCIATED_SYMPTOM_IDS)[number]

export const ASSOCIATED_SYMPTOM_LABELS: Record<AssociatedSymptomId, string> = {
  fever: 'Fever',
  nausea: 'Nausea',
  vomiting: 'Vomiting',
  severeBreathingDifficulty: 'Severe difficulty breathing',
  chestPain: 'Chest pain',
  radiatingPain: 'Pain spreading to arm, jaw, back, or neck',
  sweatingWithChestPain: 'Sudden sweating with chest discomfort',
  faintingOrLossOfConsciousness: 'Fainting or loss of consciousness',
  severeBleeding: 'Severe or uncontrolled bleeding',
  strokeSigns: 'Facial drooping, slurred speech, or sudden one-sided weakness',
  severeConfusion: 'Sudden severe confusion',
  throatSwelling: 'Throat or tongue swelling',
  bloodInStoolOrVomit: 'Blood in stool or vomit',
  unableToKeepFluidsDown: 'Unable to keep any fluids down',
  severeHeadacheWorstOfLife: 'Sudden, "worst headache of my life"',
}

export type TrendValue = 'improving' | 'stable' | 'worsening'

export type AssociatedSymptoms = Partial<Record<AssociatedSymptomId, Provenance<ReportStatus>>>

/**
 * The structured intake record distilled from the conversation. See
 * docs/CarePath_AI_Plan.md Section 3's field table. Every field is a
 * provenance envelope, never a bare value.
 */
export interface IntakeRecord {
  chiefComplaint?: Provenance<string>
  location?: Provenance<string>
  onsetDescription?: Provenance<string>
  /** Approximate hours since onset, normalized for scoring. Optional. */
  onsetHours?: Provenance<number>
  durationPattern?: Provenance<string>
  /** 0-10 */
  severity?: Provenance<number>
  trend?: Provenance<TrendValue>
  character?: Provenance<string>
  age?: Provenance<number>
  isPregnantOrPossiblyPregnant?: Provenance<ReportStatus>
  medicalConditions?: Provenance<string[]>
  currentMedications?: Provenance<string[]>
  allergies?: Provenance<string[]>
  recentProceduresOrInjuries?: Provenance<string>
  vitalSigns?: Provenance<string>
  riskFactors?: Provenance<string[]>
  associatedSymptoms: AssociatedSymptoms

  // Scope-relevant free-text flags, captured verbatim from patient report
  // rather than inferred, so the scope engine never guesses.
  mentalHealthCrisisReported?: Provenance<ReportStatus>
  poisoningExposureReported?: Provenance<ReportStatus>
  traumaInjuryReported?: Provenance<ReportStatus>
  sexualHealthConcernReported?: Provenance<ReportStatus>
  postOperativeComplicationReported?: Provenance<ReportStatus>
  immunocompromisedReported?: Provenance<ReportStatus>
}

export function createEmptyIntakeRecord(): IntakeRecord {
  return { associatedSymptoms: {} }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
}
