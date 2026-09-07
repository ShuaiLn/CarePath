import { useCareFlow } from './state/useCareFlow'
import { ChatWindow } from './components/chat/ChatWindow'
import { ConfirmationScreen } from './components/confirmation/ConfirmationScreen'
import { ResultScreen } from './components/result/ResultScreen'
import { VisitSummaryView } from './components/visitSummary/VisitSummaryView'
import { MedicationLookup } from './components/medication/MedicationLookup'
import { DataControlsPanel } from './components/dataControls/DataControlsPanel'

const STAGE_LABELS = ['Symptoms', 'Confirm', 'Result', 'Visit Summary']
const STAGE_ORDER = ['intake', 'confirmation', 'result', 'visitSummary'] as const

function StageProgress({ stage }: { stage: (typeof STAGE_ORDER)[number] }) {
  const currentIndex = STAGE_ORDER.indexOf(stage)
  return (
    <div className="mx-auto mb-6 flex max-w-2xl items-center justify-center gap-2 print:hidden">
      {STAGE_LABELS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              i <= currentIndex ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-500'
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-xs ${i <= currentIndex ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
          {i < STAGE_LABELS.length - 1 && <div className="h-px w-6 bg-slate-200" />}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const {
    stage,
    messages,
    intake,
    isThinking,
    readyForConfirmation,
    careLevel,
    careRouting,
    careLevelExplanation,
    visitSummary,
    sendMessage,
    goToConfirmation,
    confirmIntakeAndAssess,
    generateSummary,
  } = useCareFlow()

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <h1 className="text-lg font-bold text-slate-900">CarePath AI</h1>
          <p className="text-xs text-slate-500">Your AI-powered healthcare navigator — not a diagnosis tool.</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <StageProgress stage={stage} />

        {stage === 'intake' && (
          <div className="mx-auto h-[65vh] max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <ChatWindow
              messages={messages}
              isThinking={isThinking}
              onSend={sendMessage}
              onDone={goToConfirmation}
              readyForConfirmation={readyForConfirmation}
            />
          </div>
        )}

        {stage === 'confirmation' && <ConfirmationScreen intake={intake} onConfirm={confirmIntakeAndAssess} />}

        {stage === 'result' && careLevel && (
          <ResultScreen
            careLevel={careLevel}
            careRouting={careRouting}
            careLevelExplanation={careLevelExplanation}
            onPrepareForVisit={generateSummary}
          />
        )}

        {stage === 'visitSummary' && visitSummary && (
          <div className="flex flex-col gap-4">
            <VisitSummaryView summary={visitSummary} />
            <div className="mx-auto w-full max-w-2xl print:hidden">
              <MedicationLookup />
            </div>
          </div>
        )}
      </main>

      <DataControlsPanel onCleared={() => window.location.reload()} />
    </div>
  )
}
