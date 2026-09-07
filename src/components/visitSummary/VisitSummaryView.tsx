import { useState } from 'react'
import type { VisitSummary } from '../../types/visitSummary'
import { formatVisitSummaryText } from '../../summary/formatVisitSummaryText'
import { Card } from '../ui/Card'
import { Banner } from '../ui/Banner'

function SymptomPills({ items, tone }: { items: { id: string; label: string }[]; tone: 'reported' | 'denied' | 'unknown' }) {
  if (items.length === 0) return <span className="text-xs text-slate-400">None</span>
  const toneClasses = {
    reported: 'bg-teal-50 text-teal-800',
    denied: 'bg-slate-100 text-slate-500',
    unknown: 'bg-amber-50 text-amber-700',
  }[tone]
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i) => (
        <span key={i.id} className={`rounded-full px-2 py-0.5 text-xs ${toneClasses}`}>
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function VisitSummaryView({ summary }: { summary: VisitSummary }) {
  const [copied, setCopied] = useState(false)
  const [focusMode, setFocusMode] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(formatVisitSummaryText(summary))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={`mx-auto flex max-w-2xl flex-col gap-4 ${focusMode ? 'text-lg' : ''}`}>
      <Banner tone="warning">
        <strong>{summary.disclaimer}</strong>
      </Banner>

      <div className="flex justify-end gap-2 print:hidden">
        <button onClick={handleCopy} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Print / Save as PDF
        </button>
        <button
          onClick={() => setFocusMode((v) => !v)}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {focusMode ? 'Exit Show Doctor view' : 'Show Doctor'}
        </button>
      </div>

      <Card>
        <h2 className="mb-3 text-base font-bold text-slate-900">Why I'm seeking care</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Chief complaint</dt>
            <dd className="text-right text-slate-800">{summary.whyImSeekingCare.chiefComplaint ?? 'Not provided'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Started</dt>
            <dd className="text-right text-slate-800">{summary.whyImSeekingCare.startedWhen ?? 'Not provided'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Severity</dt>
            <dd className="text-right text-slate-800">{summary.whyImSeekingCare.severity ?? 'Not provided'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Progression</dt>
            <dd className="text-right text-slate-800">{summary.whyImSeekingCare.progression ?? 'Not provided'}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-bold text-slate-900">Other symptoms I reported</h2>
        <div className="space-y-2">
          <div>
            <div className="mb-1 text-xs font-medium text-slate-400">Reported</div>
            <SymptomPills items={summary.otherSymptomsIReported.reported} tone="reported" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-400">Denied</div>
            <SymptomPills items={summary.otherSymptomsIReported.denied} tone="denied" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-400">Not provided</div>
            <SymptomPills items={summary.otherSymptomsIReported.unknown} tone="unknown" />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-bold text-slate-900">Relevant context</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Medical conditions</dt>
            <dd className="text-right text-slate-800">{summary.relevantContext.medicalConditions ?? 'Not provided'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Current medications</dt>
            <dd className="text-right text-slate-800">{summary.relevantContext.currentMedications ?? 'Not provided'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Known allergies</dt>
            <dd className="text-right text-slate-800">{summary.relevantContext.allergies ?? 'Not provided'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Recent events</dt>
            <dd className="text-right text-slate-800">{summary.relevantContext.recentEvents ?? 'Not provided'}</dd>
          </div>
        </dl>
      </Card>

      <Card className="border-teal-200 bg-teal-50/40">
        <h2 className="mb-2 text-base font-bold text-slate-900">CarePath navigation result</h2>
        <p className="text-sm text-slate-800">
          <span className="font-medium">Recommended care level:</span> {summary.carePathNavigationResult.careLevelLabel}
        </p>
        {summary.carePathNavigationResult.routing && (
          <>
            <p className="text-sm text-slate-800">
              <span className="font-medium">Suggested starting point:</span>{' '}
              {summary.carePathNavigationResult.routing.bestStartingProvider}
            </p>
            <p className="text-sm text-slate-800">
              <span className="font-medium">Possible downstream specialty:</span>{' '}
              {summary.carePathNavigationResult.routing.possibleDownstreamSpecialty}
            </p>
          </>
        )}
        <p className="mt-2 text-xs italic text-slate-500">{summary.carePathNavigationResult.disclaimer}</p>
      </Card>

      <Card>
        <h2 className="mb-2 text-base font-bold text-slate-900">Questions for my doctor</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
          {summary.questionsForMyDoctor.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
