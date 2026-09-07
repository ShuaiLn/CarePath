import type { LlmAdapter, ExtractionInput, ExtractionResult } from './types'
import type { IntakeRecord } from '../../types/intake'
import { makeProvenance } from '../../types/provenance'
import type { CareLevelResult } from '../../types/careLevel'
import { CARE_LEVEL_LABELS } from '../../types/careLevel'
import {
  extractSeverity,
  extractTrend,
  extractAge,
  extractOnsetHours,
  extractDurationPattern,
  parseListField,
  scanAssociatedSymptomsFromFreeText,
  scanScopeKeywordsFromFreeText,
  guessChiefComplaint,
  guessLocation,
  isBlanketNo,
  isBlanketYesOnly,
  isUnsure,
} from './textParsing'
import { CRITICAL_SCREENING_IDS, SECONDARY_SCREENING_IDS } from '../../intake/fieldChecklist'

/**
 * Deterministic, offline, keyword-based "LLM" adapter. This is the
 * development fallback used when no real LLM API key/backend is
 * configured — see docs/CarePath_AI_Plan.md Section 12 (AI provider keys
 * must never live client-side; a backend proxies real calls) and the
 * project requirement that a missing API key must never block the MVP
 * from running locally.
 *
 * It implements the exact same LlmAdapter contract a real model-backed
 * adapter would, so swapping it out later requires no changes to the
 * conversation engine or any deterministic engine.
 */
export class MockLlmAdapter implements LlmAdapter {
  readonly name = 'mock-rule-based'

  async extractFromMessage(input: ExtractionInput): Promise<ExtractionResult> {
    const { message, questionId } = input
    const updatedIntake: Partial<IntakeRecord> = {}

    // Always-on safety net: scan every message for red-flag / scope
    // keywords regardless of which question is currently being asked, so
    // an urgent detail mentioned early is never missed while waiting for
    // its dedicated question.
    const redFlagHits = scanAssociatedSymptomsFromFreeText(message)
    const scopeHits = scanScopeKeywordsFromFreeText(message)
    if (Object.keys(redFlagHits).length > 0) {
      updatedIntake.associatedSymptoms = {}
      for (const [id, status] of Object.entries(redFlagHits)) {
        updatedIntake.associatedSymptoms[id as keyof typeof redFlagHits] = makeProvenance(status, 'patient_reported')
      }
    }
    if (scopeHits.pregnancy) updatedIntake.isPregnantOrPossiblyPregnant = makeProvenance(scopeHits.pregnancy, 'patient_reported')
    if (scopeHits.mentalHealthCrisis) updatedIntake.mentalHealthCrisisReported = makeProvenance(scopeHits.mentalHealthCrisis, 'patient_reported')
    if (scopeHits.poisoning) updatedIntake.poisoningExposureReported = makeProvenance(scopeHits.poisoning, 'patient_reported')
    if (scopeHits.trauma) updatedIntake.traumaInjuryReported = makeProvenance(scopeHits.trauma, 'patient_reported')
    if (scopeHits.sexualHealth) updatedIntake.sexualHealthConcernReported = makeProvenance(scopeHits.sexualHealth, 'patient_reported')
    if (scopeHits.postOperative) updatedIntake.postOperativeComplicationReported = makeProvenance(scopeHits.postOperative, 'patient_reported')
    if (scopeHits.immunocompromised) updatedIntake.immunocompromisedReported = makeProvenance(scopeHits.immunocompromised, 'patient_reported')

    let needsClarification: string | null = null

    switch (questionId) {
      case 'initial': {
        updatedIntake.chiefComplaint = makeProvenance(guessChiefComplaint(message), 'patient_reported')
        const location = guessLocation(message)
        if (location) updatedIntake.location = makeProvenance(location, 'patient_reported')
        const severity = extractSeverity(message)
        if (severity !== null) updatedIntake.severity = makeProvenance(severity, 'patient_reported')
        const durationPattern = extractDurationPattern(message)
        if (durationPattern) updatedIntake.durationPattern = makeProvenance(durationPattern, 'patient_reported')
        const onsetHours = extractOnsetHours(message)
        if (onsetHours !== null) {
          updatedIntake.onsetHours = makeProvenance(onsetHours, 'patient_reported')
          updatedIntake.onsetDescription = makeProvenance(message, 'patient_reported')
        }
        break
      }
      case 'onset': {
        const durationPattern = extractDurationPattern(message) ?? 'Continuous'
        updatedIntake.durationPattern = makeProvenance(durationPattern, 'patient_reported')
        updatedIntake.onsetDescription = makeProvenance(message, 'patient_reported')
        const onsetHours = extractOnsetHours(message)
        if (onsetHours !== null) {
          updatedIntake.onsetHours = makeProvenance(onsetHours, 'patient_reported')
        } else if (!isBlanketNo(message) && message.trim().length > 0) {
          needsClarification =
            "I'm not sure I understood exactly when this started — can you confirm roughly how long ago (e.g. \"3 days ago\" or \"2 hours ago\")?"
        }
        break
      }
      case 'severity': {
        const severity = extractSeverity(message)
        if (severity !== null) {
          updatedIntake.severity = makeProvenance(severity, 'patient_reported')
        } else {
          needsClarification =
            "I'm not sure I understood the severity — can you confirm with a number from 0 (none) to 10 (worst pain imaginable)?"
        }
        break
      }
      case 'trend': {
        const trend = extractTrend(message)
        if (trend) {
          updatedIntake.trend = makeProvenance(trend, 'patient_reported')
        } else {
          needsClarification =
            "I'm not sure I understood — can you confirm if it's getting better, staying the same, or getting worse?"
        }
        break
      }
      case 'screeningSymptoms':
      case 'moreScreeningSymptoms': {
        const ids = questionId === 'screeningSymptoms' ? CRITICAL_SCREENING_IDS : SECONDARY_SCREENING_IDS
        if (isBlanketNo(message)) {
          updatedIntake.associatedSymptoms = { ...updatedIntake.associatedSymptoms }
          for (const id of ids) {
            // Never let a generic blanket "no" silently overwrite a symptom
            // already explicitly reported earlier in the conversation (e.g.
            // mentioned in the patient's initial free-text message) — an
            // apparent later contradiction must not erase an earlier
            // positive red flag.
            const alreadyKnown = input.currentIntake.associatedSymptoms[id] !== undefined || updatedIntake.associatedSymptoms[id] !== undefined
            if (!alreadyKnown) {
              updatedIntake.associatedSymptoms[id] = makeProvenance('denied', 'patient_reported')
            }
          }
        } else if (isBlanketYesOnly(message)) {
          needsClarification = 'Which of these are you experiencing — can you tell me which one(s)?'
        } else {
          // Positive keyword hits were already merged above via redFlagHits.
          // Anything not explicitly mentioned stays "unknown" rather than
          // being assumed denied — an unmentioned symptom is not a "no."
        }
        break
      }
      case 'age': {
        const age = extractAge(message)
        if (age !== null) {
          updatedIntake.age = makeProvenance(age, 'patient_reported')
        } else if (!isUnsure(message)) {
          needsClarification = "I'm not sure I caught your age — can you confirm with a number?"
        }
        break
      }
      case 'pregnancy': {
        const t = message.trim().toLowerCase()
        if (isBlanketNo(t) || /\b(male|man|n\/a|not applicable)\b/.test(t)) {
          updatedIntake.isPregnantOrPossiblyPregnant = makeProvenance('denied', 'patient_reported')
        } else if (/\b(yes|maybe|possibly|could be)\b/.test(t) || scopeHits.pregnancy) {
          updatedIntake.isPregnantOrPossiblyPregnant = makeProvenance('reported', 'patient_reported')
        }
        // Otherwise leave as unknown rather than guessing.
        break
      }
      case 'scopeCheck': {
        if (isBlanketNo(message)) {
          const scopeKeys = [
            'traumaInjuryReported',
            'postOperativeComplicationReported',
            'poisoningExposureReported',
            'mentalHealthCrisisReported',
            'immunocompromisedReported',
            'sexualHealthConcernReported',
          ] as const
          for (const key of scopeKeys) {
            // Same rule as screening symptoms: a blanket "no" here must never
            // overwrite something already explicitly reported earlier.
            const alreadyKnown = input.currentIntake[key] !== undefined || updatedIntake[key] !== undefined
            if (!alreadyKnown) {
              updatedIntake[key] = makeProvenance('denied', 'patient_reported')
            }
          }
        }
        // Positive hits already merged above; anything unmentioned and not
        // covered by a blanket "no" remains unknown.
        break
      }
      case 'medicalConditions': {
        updatedIntake.medicalConditions = makeProvenance(parseListField(message), 'patient_reported')
        break
      }
      case 'currentMedications': {
        updatedIntake.currentMedications = makeProvenance(parseListField(message), 'patient_reported')
        break
      }
      case 'allergies': {
        updatedIntake.allergies = makeProvenance(parseListField(message), 'patient_reported')
        break
      }
    }

    return { updatedIntake, needsClarification }
  }

  async explainCareLevel(result: CareLevelResult): Promise<string> {
    const label = CARE_LEVEL_LABELS[result.tier]
    if (result.redFlagOverride) {
      return `Your recommended care level is "${label}" because you reported: ${result.triggeredRedFlags.join(', ')}. This is a safety rule that always takes priority.`
    }
    if (result.factors.length === 0) {
      return `Your recommended care level is "${label}" based on the information you provided.`
    }
    const reasons = result.factors.map((f) => f.detail).join('; ')
    return `Your recommended care level is "${label}" mainly because: ${reasons}.`
  }
}
