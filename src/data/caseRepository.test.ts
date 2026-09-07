import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { createCase, saveCase, getCase, listCases, deleteCase } from './caseRepository'
import { clearAllLocalData, exportAllDataAsJson } from './dataControls'

beforeEach(async () => {
  await db.cases.clear()
  await db.medications.clear()
  await db.savedFacilities.clear()
})

describe('caseRepository', () => {
  it('creates and retrieves a case by id', async () => {
    const created = await createCase()
    const fetched = await getCase(created.id)
    expect(fetched?.id).toBe(created.id)
    expect(fetched?.status).toBe('in_progress')
  })

  it('persists updates via saveCase', async () => {
    const created = await createCase()
    created.status = 'confirmed'
    await saveCase(created)
    const fetched = await getCase(created.id)
    expect(fetched?.status).toBe('confirmed')
  })

  it('lists cases newest-updated first', async () => {
    const a = await createCase()
    await new Promise((r) => setTimeout(r, 2))
    const b = await createCase()
    const list = await listCases()
    expect(list[0].id).toBe(b.id)
    expect(list[1].id).toBe(a.id)
  })

  it('deletes a case', async () => {
    const created = await createCase()
    await deleteCase(created.id)
    expect(await getCase(created.id)).toBeUndefined()
  })
})

describe('data lifecycle controls', () => {
  it('clearAllLocalData removes all cases', async () => {
    await createCase()
    await createCase()
    await clearAllLocalData()
    expect(await listCases()).toHaveLength(0)
  })

  it('exportAllDataAsJson includes created cases and is valid JSON', async () => {
    const created = await createCase()
    const json = await exportAllDataAsJson()
    const parsed = JSON.parse(json)
    expect(parsed.cases.some((c: { id: string }) => c.id === created.id)).toBe(true)
    expect(parsed.device).toMatch(/this browser/i)
  })
})
