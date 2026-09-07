import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, IntakeRecord } from '../types/intake'
import { createEmptyIntakeRecord } from '../types/intake'
import type { IntakeQuestionId } from '../intake/fieldChecklist'
import { pickNextQuestion, mergeIntake, MAX_CLARIFICATION_ATTEMPTS } from '../intake/conversationEngine'
import { getLlmAdapter } from '../adapters/llm'
import { assessCareLevel } from '../engines/careLevelEngine'
import { routeCare } from '../engines/careRoutingEngine'
import { generateVisitSummary } from '../summary/visitSummaryGenerator'
import { createCase, saveCase } from '../data/caseRepository'
import type { CaseRecord } from '../types/case'
import type { EngineOutcome } from '../types/engineOutcomes'
import type { CareLevelResult } from '../types/careLevel'
import type { CareRoutingResult } from '../types/careRouting'
import type { VisitSummary } from '../types/visitSummary'

/**
 * Orchestrates the end-to-end flow described in
 * docs/CarePath_AI_Plan.md Section 2:
 *
 *   Symptoms -> AI Intake -> Care-Level Assessment -> Care Routing ->
 *   Doctor Visit Summary -> saved locally
 *
 * This hook owns UI-facing state only (messages, current stage). It never
 * makes a safety-relevant decision itself — it calls the LLM adapter for
 * extraction/explanation and the deterministic engines for everything
 * else, exactly per Section 12's governing pattern.
 */

export type FlowStage = 'intake' | 'confirmation' | 'result' | 'visitSummary'

function now(): string {
  return new Date().toISOString()
}

function addMessage(list: ChatMessage[], role: ChatMessage['role'], text: string): ChatMessage[] {
  return [...list, { id: crypto.randomUUID(), role, text, createdAt: now() }]
}

export function useCareFlow() {
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null)
  const [stage, setStage] = useState<FlowStage>('intake')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [intake, setIntake] = useState<IntakeRecord>(createEmptyIntakeRecord())
  const [isThinking, setIsThinking] = useState(false)
  const [pendingQuestionId, setPendingQuestionId] = useState<IntakeQuestionId | 'initial'>('initial')
  const [readyForConfirmation, setReadyForConfirmation] = useState(false)

  const askedIdsRef = useRef<Set<IntakeQuestionId>>(new Set())
  const clarificationAttemptsRef = useRef<Record<string, number>>({})
  const llm = useRef(getLlmAdapter())

  const [careLevel, setCareLevel] = useState<EngineOutcome<CareLevelResult> | null>(null)
  const [careRouting, setCareRouting] = useState<EngineOutcome<CareRoutingResult> | null>(null)
  const [careLevelExplanation, setCareLevelExplanation] = useState<string | null>(null)
  const [visitSummary, setVisitSummary] = useState<VisitSummary | null>(null)

  useEffect(() => {
    createCase().then((created) => {
      setCaseRecord(created)
      setMessages(
        addMessage(
          [],
          'assistant',
          "Hi, I'm CarePath AI. I'm not a diagnosis tool — I help you figure out what to do next. What's going on?",
        ),
      )
    })
  }, [])

  const persist = useCallback(
    async (updates: Partial<CaseRecord>) => {
      setCaseRecord((prev) => {
        if (!prev) return prev
        const next = { ...prev, ...updates, updatedAt: now() }
        void saveCase(next)
        return next
      })
    },
    [],
  )

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return
      let workingMessages = addMessage(messages, 'user', text)
      setMessages(workingMessages)
      setIsThinking(true)

      const extraction = await llm.current.extractFromMessage({
        message: text,
        questionId: pendingQuestionId,
        currentIntake: intake,
      })

      const mergedIntake = mergeIntake(intake, extraction.updatedIntake)
      setIntake(mergedIntake)

      if (extraction.needsClarification) {
        const attempts = (clarificationAttemptsRef.current[pendingQuestionId] ?? 0) + 1
        clarificationAttemptsRef.current[pendingQuestionId] = attempts
        if (attempts <= MAX_CLARIFICATION_ATTEMPTS) {
          workingMessages = addMessage(workingMessages, 'assistant', extraction.needsClarification)
          setMessages(workingMessages)
          setIsThinking(false)
          await persist({ conversation: workingMessages, intake: mergedIntake })
          return
        }
        // Give up clarifying after a couple of tries so the chat can't get
        // stuck; the field is simply left as-is (unknown/unset) rather than
        // guessing a value.
      }

      if (pendingQuestionId !== 'initial') {
        askedIdsRef.current.add(pendingQuestionId)
      }

      const next = pickNextQuestion(mergedIntake, askedIdsRef.current)
      if (next) {
        setPendingQuestionId(next.id)
        workingMessages = addMessage(workingMessages, 'assistant', next.prompt)
      } else {
        setReadyForConfirmation(true)
        workingMessages = addMessage(
          workingMessages,
          'assistant',
          "Thanks — I think I have enough to summarize what I understood. Take a look and let me know if anything's wrong.",
        )
      }
      setMessages(workingMessages)

      setIsThinking(false)
      await persist({ conversation: workingMessages, intake: mergedIntake })
    },
    [intake, isThinking, messages, pendingQuestionId, persist],
  )

  const goToConfirmation = useCallback(() => {
    setStage('confirmation')
  }, [])

  const updateIntakeField = useCallback((updater: (draft: IntakeRecord) => IntakeRecord) => {
    setIntake((prev) => updater(prev))
  }, [])

  const confirmIntakeAndAssess = useCallback(
    async (confirmedIntake: IntakeRecord) => {
      setIntake(confirmedIntake)
      const level = assessCareLevel(confirmedIntake)
      const routing = routeCare(confirmedIntake, level)
      setCareLevel(level)
      setCareRouting(routing)

      if (level.kind === 'RESULT') {
        const explanation = await llm.current.explainCareLevel(level.result)
        setCareLevelExplanation(explanation)
      } else {
        setCareLevelExplanation(null)
      }

      setStage('result')
      await persist({
        intake: confirmedIntake,
        intakeConfirmedAt: now(),
        status: 'assessed',
        careLevel: level,
        careRouting: routing,
      })
    },
    [persist],
  )

  const generateSummary = useCallback(async () => {
    if (!careLevel) return
    const summary = generateVisitSummary(intake, careLevel, careRouting)
    setVisitSummary(summary)
    setStage('visitSummary')
    await persist({ visitSummary: summary, status: 'summary_ready' })
  }, [careLevel, careRouting, intake, persist])

  return {
    caseRecord,
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
    updateIntakeField,
    confirmIntakeAndAssess,
    generateSummary,
  }
}
