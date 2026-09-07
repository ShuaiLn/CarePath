import { useState } from 'react'
import type { FormEvent } from 'react'
import type { MedicationInfo } from '../../types/medication'
import { getMedicationAdapter } from '../../adapters/medication'
import { Card } from '../ui/Card'

/**
 * Pre-visit medication Q&A — docs/CarePath_AI_Plan.md Section 8. Grounded
 * in RxNorm/DailyMed (mocked here), never LLM memory. The AI never alters
 * or recommends dosing — MedicationInfo has no dosage field, and nothing
 * here renders one.
 */
export function MedicationLookup() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<MedicationInfo | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    try {
      const info = await getMedicationAdapter().lookup(query.trim())
      setResult(info)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 text-base font-bold text-slate-900">Ask about a medication</h2>
      <p className="mb-3 text-xs text-slate-500">
        Information is sourced from RxNorm and DailyMed label data, never invented. This never suggests a dose — always
        follow your prescription label or your prescriber's instructions.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. amoxicillin"
          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {loading ? '…' : 'Look up'}
        </button>
      </form>

      {result && (
        <div className="mt-3 rounded-md border border-slate-200 p-3 text-sm">
          {!result.found ? (
            <p className="text-slate-500">No match found for "{result.queryText}." Ask your pharmacist for details.</p>
          ) : (
            <>
              <div className="font-semibold text-slate-900">{result.normalizedName}</div>
              <div className="mt-1 text-xs text-slate-500">RxCUI: {result.rxcui}</div>
              {result.commonUses.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-medium text-slate-400">Commonly used for</div>
                  <div className="text-slate-700">{result.commonUses.join(', ')}</div>
                </div>
              )}
              {result.commonSideEffects.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-medium text-slate-400">Common side effects</div>
                  <div className="text-slate-700">{result.commonSideEffects.join(', ')}</div>
                </div>
              )}
              {result.labelWarnings.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-medium text-slate-400">Label warnings</div>
                  <div className="text-slate-700">{result.labelWarnings.join(' ')}</div>
                </div>
              )}
              <div className="mt-2">
                <div className="text-xs font-medium text-slate-400">Questions for your pharmacist</div>
                <ul className="list-disc pl-4 text-slate-700">
                  {result.pharmacistQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
