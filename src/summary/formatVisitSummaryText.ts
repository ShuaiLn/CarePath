import type { VisitSummary } from '../types/visitSummary'

/** Plain-text rendering used for the Copy action. */
export function formatVisitSummaryText(summary: VisitSummary): string {
  const lines: string[] = []
  lines.push(summary.disclaimer)
  lines.push('')
  lines.push('WHY I\'M SEEKING CARE')
  lines.push(`Chief complaint: ${summary.whyImSeekingCare.chiefComplaint ?? 'Not provided'}`)
  lines.push(`Started: ${summary.whyImSeekingCare.startedWhen ?? 'Not provided'}`)
  lines.push(`Severity: ${summary.whyImSeekingCare.severity ?? 'Not provided'}`)
  lines.push(`Progression: ${summary.whyImSeekingCare.progression ?? 'Not provided'}`)
  lines.push('')
  lines.push('OTHER SYMPTOMS I REPORTED')
  lines.push(`Reported: ${summary.otherSymptomsIReported.reported.map((l) => l.label).join(', ') || 'None'}`)
  lines.push(`Denied: ${summary.otherSymptomsIReported.denied.map((l) => l.label).join(', ') || 'None'}`)
  lines.push(
    `Not provided: ${summary.otherSymptomsIReported.unknown.map((l) => l.label).join(', ') || 'None'}`,
  )
  lines.push('')
  lines.push('RELEVANT CONTEXT')
  lines.push(`Medical conditions: ${summary.relevantContext.medicalConditions ?? 'Not provided'}`)
  lines.push(`Current medications: ${summary.relevantContext.currentMedications ?? 'Not provided'}`)
  lines.push(`Known allergies: ${summary.relevantContext.allergies ?? 'Not provided'}`)
  lines.push(`Recent events: ${summary.relevantContext.recentEvents ?? 'Not provided'}`)
  lines.push('')
  lines.push('CAREPATH NAVIGATION RESULT')
  lines.push(`Recommended care level: ${summary.carePathNavigationResult.careLevelLabel}`)
  if (summary.carePathNavigationResult.routing) {
    lines.push(`Suggested starting point: ${summary.carePathNavigationResult.routing.bestStartingProvider}`)
    lines.push(`Possible downstream specialty: ${summary.carePathNavigationResult.routing.possibleDownstreamSpecialty}`)
  }
  lines.push(summary.carePathNavigationResult.disclaimer)
  lines.push('')
  lines.push('QUESTIONS FOR MY DOCTOR')
  for (const q of summary.questionsForMyDoctor) lines.push(`- ${q}`)
  return lines.join('\n')
}
