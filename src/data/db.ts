import Dexie, { type EntityTable } from 'dexie'
import type { CaseRecord } from '../types/case'
import type { MedicationInfo } from '../types/medication'
import type { FacilityCard } from '../types/facility'

/**
 * MVP local storage: IndexedDB + Dexie — see docs/CarePath_AI_Plan.md
 * Section 12. Health history stays local-first; no server database is
 * required for the MVP. Every table uses a UUID primary key (never an
 * auto-increment integer) plus createdAt/updatedAt timestamps, so an
 * optional future Supabase sync can be layered on without a schema
 * rewrite (Section 12's "no requirement to migrate old local data").
 */

export interface StoredMedicationLookup {
  id: string
  caseId: string | null
  info: MedicationInfo
  createdAt: string
}

export interface StoredSavedFacility {
  id: string
  caseId: string
  facility: FacilityCard
  createdAt: string
}

export class CarePathDatabase extends Dexie {
  cases!: EntityTable<CaseRecord, 'id'>
  medications!: EntityTable<StoredMedicationLookup, 'id'>
  savedFacilities!: EntityTable<StoredSavedFacility, 'id'>

  constructor() {
    super('carepath-ai')
    this.version(1).stores({
      cases: 'id, status, createdAt, updatedAt',
      medications: 'id, caseId, createdAt',
      savedFacilities: 'id, caseId, createdAt',
    })
  }
}

export const db = new CarePathDatabase()
