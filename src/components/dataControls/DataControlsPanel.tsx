import { useState } from 'react'
import { exportAllDataAsJson, downloadExportedData, clearAllLocalData } from '../../data/dataControls'

/**
 * Local data lifecycle controls — docs/CarePath_AI_Plan.md Section 12.
 * Copy is deliberately precise: "this browser, this device," never the
 * vaguer "stays on your device."
 */
export function DataControlsPanel({ onCleared }: { onCleared: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    setBusy(true)
    try {
      const json = await exportAllDataAsJson()
      downloadExportedData(json)
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    setBusy(true)
    try {
      await clearAllLocalData()
      onCleared()
    } finally {
      setBusy(false)
      setConfirmingClear(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-10">
      {open && (
        <div className="mb-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="mb-3 text-xs text-slate-500">
            Data is stored in this browser on this device. It is not automatically backed up or synced anywhere else.
          </p>
          <button
            onClick={handleExport}
            disabled={busy}
            className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Export my data
          </button>
          {!confirmingClear ? (
            <button
              onClick={() => setConfirmingClear(true)}
              disabled={busy}
              className="w-full rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Clear my health data
            </button>
          ) : (
            <div className="rounded-md border border-red-300 bg-red-50 p-2">
              <p className="mb-2 text-xs text-red-800">This permanently deletes all cases stored in this browser. Are you sure?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleClear}
                  disabled={busy}
                  className="flex-1 rounded-md bg-red-700 px-2 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                >
                  Yes, delete everything
                </button>
                <button
                  onClick={() => setConfirmingClear(false)}
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-slate-800"
      >
        {open ? 'Close' : 'My data'}
      </button>
    </div>
  )
}
