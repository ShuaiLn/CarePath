import type { IntakeRecord, ChatMessage } from './intake'
import type { EngineOutcome } from './engineOutcomes'
import type { CareLevelResult } from './careLevel'
import type { CareRoutingResult } from './careRouting'
import type { VisitSummary } from './visitSummary'

/**
 * A `case` represents one health issue end-to-end. See
 * docs/CarePath_AI_Plan.md Section 9's case/visit hierarchy. This MVP
 * stores the pre-visit half of that hierarchy (symptom_reports,
 * urgency_assessments, specialty_recommendations, visit_summaries) as one
 * record per case; the after-visit `visits` hierarchy is a later addition.
 */
export interface CaseRecord {
  id: string
  status: 'in_progress' | 'confirmed' | 'assessed' | 'summary_ready'
  createdAt: string
  updatedAt: string

  conversation: ChatMessage[]
  intake: IntakeRecord
  intakeConfirmedAt: string | null

  careLevel: EngineOutcome<CareLevelResult> | null
  careRouting: EngineOutcome<CareRoutingResult> | null

  visitSummary: VisitSummary | null
}

export function createCaseRecord(id: string): CaseRecord {
  const now = new Date().toISOString()
  return {
    id,
    status: 'in_progress',
    createdAt: now,
    updatedAt: now,
    conversation: [],
    intake: { associatedSymptoms: {} },
    intakeConfirmedAt: null,
    careLevel: null,
    careRouting: null,
    visitSummary: null,
  }
}
