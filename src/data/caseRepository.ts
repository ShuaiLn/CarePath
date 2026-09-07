import { db } from './db'
import type { CaseRecord } from '../types/case'
import { createCaseRecord } from '../types/case'

/**
 * All local persistence for cases goes through this module — React
 * components never talk to Dexie directly. This keeps the storage
 * mechanism swappable (e.g. adding an optional Supabase sync layer later,
 * per docs/CarePath_AI_Plan.md Section 12) without touching UI code.
 */

export async function createCase(): Promise<CaseRecord> {
  const record = createCaseRecord(crypto.randomUUID())
  await db.cases.put(record)
  return record
}

export async function saveCase(record: CaseRecord): Promise<void> {
  await db.cases.put({ ...record, updatedAt: new Date().toISOString() })
}

export async function getCase(id: string): Promise<CaseRecord | undefined> {
  return db.cases.get(id)
}

export async function listCases(): Promise<CaseRecord[]> {
  const all = await db.cases.toArray()
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function deleteCase(id: string): Promise<void> {
  await db.cases.delete(id)
}
