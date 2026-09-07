/**
 * Shared outcome envelope for every decision engine (care level, routing,
 * facility ranking). See docs/CarePath_AI_Plan.md Section 10.
 *
 * Every engine must be able to say "I don't know" instead of being forced
 * into a normal-looking category when the input doesn't safely support one.
 */

export const OUT_OF_SCOPE_CATEGORIES = [
  'pediatric',
  'pregnancy',
  'mental_health_crisis',
  'poisoning',
  'trauma',
  'sexual_health',
  'post_operative_complication',
  'immunocompromised',
] as const

export type OutOfScopeCategory = (typeof OUT_OF_SCOPE_CATEGORIES)[number]

export const OUT_OF_SCOPE_COPY: Record<OutOfScopeCategory, string> = {
  pediatric:
    'CarePath AI is designed for adult symptom navigation. For a child or infant, please contact a pediatrician, pediatric urgent care, or your child’s care team.',
  pregnancy:
    'Pregnancy-related symptoms need assessment tailored to pregnancy, which CarePath AI is not designed to provide. Please contact your OB-GYN, midwife, or labor and delivery unit.',
  mental_health_crisis:
    'If you are in immediate danger or thinking about harming yourself, please call or text 988 (Suicide & Crisis Lifeline) or call 911 now. CarePath AI is not designed to assess mental health crises.',
  poisoning:
    'For a suspected poisoning or overdose, please contact Poison Control immediately at 1-800-222-1222 (US) or call 911. CarePath AI is not designed to assess poisoning.',
  trauma:
    'CarePath AI is not designed to assess injuries from significant trauma (falls, accidents, violence). Please seek in-person care or call 911 if the injury is severe.',
  sexual_health:
    'CarePath AI is not designed to assess sexual health concerns. Please contact a primary care provider, OB-GYN, urologist, or a sexual health clinic.',
  post_operative_complication:
    'Possible complications after a recent surgery or procedure should be evaluated by the team who performed it, or an emergency department if severe. CarePath AI is not designed to assess post-operative complications.',
  immunocompromised:
    'Because a weakened immune system can change how quickly a condition becomes serious, CarePath AI is not designed to assess symptoms for immunocompromised patients. Please contact your care team promptly.',
}

export const INSUFFICIENT_INFORMATION_COPY =
  'I don’t have enough information to recommend a care setting safely. A healthcare professional can help assess this.'

export type EngineOutcomeKind = 'RESULT' | 'INSUFFICIENT_INFORMATION' | 'OUT_OF_SCOPE'

export interface InsufficientInformationOutcome {
  kind: 'INSUFFICIENT_INFORMATION'
  message: string
  missingFields: string[]
}

export interface OutOfScopeOutcome {
  kind: 'OUT_OF_SCOPE'
  category: OutOfScopeCategory
  message: string
}

export type EngineOutcome<TResult> =
  | { kind: 'RESULT'; result: TResult }
  | InsufficientInformationOutcome
  | OutOfScopeOutcome

export function insufficientInformation(missingFields: string[]): InsufficientInformationOutcome {
  return { kind: 'INSUFFICIENT_INFORMATION', message: INSUFFICIENT_INFORMATION_COPY, missingFields }
}

export function outOfScope(category: OutOfScopeCategory): OutOfScopeOutcome {
  return { kind: 'OUT_OF_SCOPE', category, message: OUT_OF_SCOPE_COPY[category] }
}
