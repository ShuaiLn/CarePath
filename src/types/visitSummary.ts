import type { ReportStatus } from './provenance'
import type { CareLevelTier } from './careLevel'
import type { CareRoutingResult } from './careRouting'

/**
 * Doctor Visit Summary — see docs/CarePath_AI_Plan.md Section 7. Generated
 * from a template applied to structured facts, never LLM freestyle
 * summarization, so the summary can never say something the structured
 * intake data doesn't support.
 */
export interface SymptomStatusLine {
  id: string
  label: string
  status: ReportStatus
}

export interface VisitSummary {
  generatedAt: string
  disclaimer: string

  whyImSeekingCare: {
    chiefComplaint: string | null
    startedWhen: string | null
    severity: string | null
    progression: string | null
  }

  otherSymptomsIReported: {
    reported: SymptomStatusLine[]
    denied: SymptomStatusLine[]
    unknown: SymptomStatusLine[]
  }

  relevantContext: {
    medicalConditions: string | null
    currentMedications: string | null
    allergies: string | null
    recentEvents: string | null
  }

  carePathNavigationResult: {
    careLevelTier: CareLevelTier | 'INSUFFICIENT_INFORMATION' | 'OUT_OF_SCOPE'
    careLevelLabel: string
    routing: CareRoutingResult | null
    disclaimer: string
  }

  questionsForMyDoctor: string[]
}
