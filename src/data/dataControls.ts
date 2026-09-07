import { db } from './db'

/**
 * Local data lifecycle controls — see docs/CarePath_AI_Plan.md Section 12.
 * Local-first is not automatically safe (a shared computer/browser profile
 * means on-device data isn't private by default), so the product ships
 * real controls: clear data, export data. Copy referencing this data must
 * say "Data is stored in this browser on this device," never the vaguer
 * "stays on your device."
 */

export interface ExportedData {
  exportedAt: string
  device: string
  cases: unknown[]
  medications: unknown[]
  savedFacilities: unknown[]
}

export async function exportAllDataAsJson(): Promise<string> {
  const [cases, medications, savedFacilities] = await Promise.all([
    db.cases.toArray(),
    db.medications.toArray(),
    db.savedFacilities.toArray(),
  ])
  const payload: ExportedData = {
    exportedAt: new Date().toISOString(),
    device: 'This browser, this device',
    cases,
    medications,
    savedFacilities,
  }
  return JSON.stringify(payload, null, 2)
}

export function downloadExportedData(json: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `carepath-data-export-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function clearAllLocalData(): Promise<void> {
  await Promise.all([db.cases.clear(), db.medications.clear(), db.savedFacilities.clear()])
}
