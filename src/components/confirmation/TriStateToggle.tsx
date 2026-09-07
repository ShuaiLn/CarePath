import type { ReportStatus } from '../../types/provenance'

const OPTIONS: { value: ReportStatus; label: string }[] = [
  { value: 'reported', label: 'Yes' },
  { value: 'denied', label: 'No' },
  { value: 'unknown', label: "Don't know / not asked" },
]

const ACTIVE_CLASSES: Record<ReportStatus, string> = {
  reported: 'bg-teal-600 text-white border-teal-600',
  denied: 'bg-slate-600 text-white border-slate-600',
  unknown: 'bg-slate-200 text-slate-700 border-slate-300',
}

export function TriStateToggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: ReportStatus
  onChange: (v: ReportStatus) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="flex shrink-0 gap-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              value === opt.value ? ACTIVE_CLASSES[opt.value] : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
