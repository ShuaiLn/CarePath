import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ChatMessage } from '../../types/intake'

interface ChatWindowProps {
  messages: ChatMessage[]
  isThinking: boolean
  onSend: (text: string) => void
  onDone: () => void
  readyForConfirmation: boolean
  disabled?: boolean
}

export function ChatWindow({ messages, isThinking, onSend, onDone, readyForConfirmation, disabled }: ChatWindowProps) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    onSend(draft)
    setDraft('')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-1 py-2">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-500">Thinking…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {readyForConfirmation && !disabled && (
        <div className="mb-3 flex justify-center">
          <button
            type="button"
            onClick={onDone}
            className="rounded-full bg-teal-700 px-5 py-2 text-sm font-medium text-white shadow hover:bg-teal-800"
          >
            Review what I understood →
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-200 pt-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled || isThinking}
          placeholder="Type your answer…"
          className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={disabled || isThinking || !draft.trim()}
          className="rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  )
}
