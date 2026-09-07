import type { AssociatedSymptomId, TrendValue } from '../../types/intake'
import type { ReportStatus } from '../../types/provenance'

/**
 * Small, deterministic text-parsing helpers used by the mock/dev LLM
 * adapter. These are intentionally simple keyword/regex heuristics, not a
 * real NLU model — good enough to drive the MVP flow end-to-end offline,
 * and isolated here so a real LLM-backed adapter can replace them later
 * without touching the engines that consume their output.
 */

const NEGATION_WORDS = ['no', 'not', 'none', 'nope', 'nothing', 'never', "don't", 'dont', "haven't", 'havent']

export function isBlanketNo(text: string): boolean {
  const t = text.trim().toLowerCase()
  return /^(no|none|nope|nothing|not really|no i don'?t|no none of that)\b/.test(t)
}

export function isBlanketYesOnly(text: string): boolean {
  const t = text.trim().toLowerCase()
  return /^(yes|yeah|yep|yup)\.?!?$/.test(t)
}

export function isUnsure(text: string): boolean {
  const t = text.trim().toLowerCase()
  return /\b(not sure|unsure|i don'?t know|idk|maybe|no idea)\b/.test(t) && t.length < 40
}

export function extractSeverity(text: string): number | null {
  const explicit = text.match(/(\d{1,2})\s*(?:\/|out of)\s*10/i)
  if (explicit) {
    const n = parseInt(explicit[1], 10)
    if (n >= 0 && n <= 10) return n
  }
  const bare = text.match(/\b(10|[0-9])\b/)
  if (bare) {
    const n = parseInt(bare[1], 10)
    if (n >= 0 && n <= 10) return n
  }
  return null
}

export function extractTrend(text: string): TrendValue | null {
  const t = text.toLowerCase()
  if (/\b(worse|worsening|deteriorat)/.test(t)) return 'worsening'
  if (/\b(better|improving|improved|resolving)/.test(t)) return 'improving'
  if (/\b(same|stable|unchanged|steady)/.test(t)) return 'stable'
  return null
}

export function extractAge(text: string): number | null {
  const m = text.match(/\b(\d{1,3})\b/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 0 && n <= 120 ? n : null
}

export function extractOnsetHours(text: string): number | null {
  const t = text.toLowerCase()
  const hourMatch = t.match(/(\d+)\s*hour/)
  if (hourMatch) return parseInt(hourMatch[1], 10)
  const dayMatch = t.match(/(\d+)\s*day/)
  if (dayMatch) return parseInt(dayMatch[1], 10) * 24
  const weekMatch = t.match(/(\d+)\s*week/)
  if (weekMatch) return parseInt(weekMatch[1], 10) * 24 * 7
  if (/\byesterday\b/.test(t)) return 24
  if (/\btoday\b|\bthis morning\b/.test(t)) return 4
  return null
}

export function extractDurationPattern(text: string): 'Continuous' | 'Intermittent' | null {
  const t = text.toLowerCase()
  if (/\b(comes and goes|on and off|intermittent|off and on)\b/.test(t)) return 'Intermittent'
  if (/\b(constant|continuous|all the time|nonstop|non-stop)\b/.test(t)) return 'Continuous'
  return null
}

export function parseListField(text: string): string[] {
  if (isBlanketNo(text)) return []
  return text
    .split(/,|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !NEGATION_WORDS.includes(s.toLowerCase()))
}

const RED_FLAG_KEYWORD_GROUPS: { id: AssociatedSymptomId; positive: RegExp[] }[] = [
  { id: 'severeBreathingDifficulty', positive: [/can'?t breathe/, /difficult(y)? breathing/, /shortness of breath/, /gasping/, /trouble breathing/] },
  { id: 'chestPain', positive: [/chest.{0,15}(pain|hurts?|pressure|tightness|aching)/] },
  { id: 'radiatingPain', positive: [/(pain|it).*(radiat|spread).*(arm|jaw|back|neck)/, /arm.*(hurts|pain).*chest/] },
  { id: 'sweatingWithChestPain', positive: [/sweating.*chest/, /cold sweat/] },
  { id: 'faintingOrLossOfConsciousness', positive: [/fainted/, /passed out/, /lost consciousness/, /blacked out/] },
  { id: 'severeBleeding', positive: [/bleeding a lot/, /won'?t stop bleeding/, /severe bleeding/, /uncontrolled bleeding/, /lots of blood/] },
  { id: 'strokeSigns', positive: [/face.*droop/, /slurred speech/, /one side.*weak/, /can'?t move (my )?(arm|leg|face)/] },
  { id: 'severeConfusion', positive: [/very confused/, /can'?t think straight/, /disoriented/] },
  { id: 'throatSwelling', positive: [/throat.*swell/, /tongue.*swell/, /throat closing/] },
  { id: 'bloodInStoolOrVomit', positive: [/blood in (my )?(stool|vomit|poop|throw ?up)/, /vomiting blood/, /coughing up blood/] },
  { id: 'unableToKeepFluidsDown', positive: [/can'?t keep.*(fluids|water|anything) down/, /throwing up everything/] },
  { id: 'severeHeadacheWorstOfLife', positive: [/worst headache of my life/, /sudden severe headache/] },
  { id: 'fever', positive: [/fever/, /temperature of/, /running a temp/] },
  { id: 'nausea', positive: [/nause/, /queasy/] },
  { id: 'vomiting', positive: [/vomit/, /throwing up/, /threw up/] },
]

export function scanAssociatedSymptomsFromFreeText(text: string): Partial<Record<AssociatedSymptomId, ReportStatus>> {
  const t = text.toLowerCase()
  const found: Partial<Record<AssociatedSymptomId, ReportStatus>> = {}
  for (const group of RED_FLAG_KEYWORD_GROUPS) {
    if (group.positive.some((re) => re.test(t))) {
      found[group.id] = 'reported'
    }
  }
  return found
}

export interface ScopeKeywordFlags {
  pregnancy?: ReportStatus
  mentalHealthCrisis?: ReportStatus
  poisoning?: ReportStatus
  trauma?: ReportStatus
  sexualHealth?: ReportStatus
  postOperative?: ReportStatus
  immunocompromised?: ReportStatus
}

const SCOPE_KEYWORD_GROUPS: { id: keyof ScopeKeywordFlags; positive: RegExp[] }[] = [
  { id: 'pregnancy', positive: [/pregnan/, /\d+\s*weeks?\s*along/] },
  { id: 'mentalHealthCrisis', positive: [/suicid/, /want to die/, /kill myself/, /self[- ]harm/, /harm myself/] },
  { id: 'poisoning', positive: [/poison/, /overdose/, /took too many pills/, /ingested/] },
  { id: 'trauma', positive: [/car accident/, /car crash/, /fell down/, /fall(en)?\b/, /hit my head/, /assault/, /stabbed/, /gunshot/] },
  { id: 'sexualHealth', positive: [/\bstd\b/, /\bsti\b/, /genital/, /sexually transmitted/] },
  { id: 'postOperative', positive: [/after (my )?surgery/, /post[- ]op/, /recent surgery/, /had surgery/] },
  { id: 'immunocompromised', positive: [/immunocompromised/, /weakened immune system/, /chemotherapy/, /on immunosuppressants/, /organ transplant/] },
]

export function scanScopeKeywordsFromFreeText(text: string): ScopeKeywordFlags {
  const t = text.toLowerCase()
  const found: ScopeKeywordFlags = {}
  for (const group of SCOPE_KEYWORD_GROUPS) {
    if (group.positive.some((re) => re.test(t))) {
      found[group.id] = 'reported'
    }
  }
  return found
}

export function guessChiefComplaint(text: string): string {
  const trimmed = text.trim()
  const firstSentence = trimmed.split(/[.!?\n]/)[0]
  return (firstSentence || trimmed).slice(0, 160)
}

export function guessLocation(text: string): string | null {
  const t = text.toLowerCase()
  const bodyParts = [
    'lower right abdomen', 'lower left abdomen', 'upper abdomen', 'abdomen', 'stomach',
    'chest', 'head', 'lower back', 'back', 'left arm', 'right arm', 'arm', 'leg',
    'knee', 'ankle', 'throat', 'ear', 'eye', 'neck', 'shoulder',
  ]
  for (const part of bodyParts) {
    if (t.includes(part)) return part
  }
  return null
}
