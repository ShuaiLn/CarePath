import type { IntakeRecord } from '../types/intake'
import type { CareLevelResult, CareLevelTier } from '../types/careLevel'
import type { CareRoutingResult, CareSetting, SymptomCategory } from '../types/careRouting'
import type { EngineOutcome } from '../types/engineOutcomes'

/**
 * Care Routing Hierarchy engine — see docs/CarePath_AI_Plan.md Section 5.
 *
 * Always produces the three-level hierarchy in order (care setting, best
 * starting provider, possible downstream specialty) so a specialty name
 * never reads as "book this now." Care setting is driven primarily by the
 * deterministic care-level tier (never by category alone), matching the
 * rule that chest pain must surface "Emergency Department," not
 * "Cardiology," as the headline.
 */

interface CategoryDefinition {
  category: SymptomCategory
  keywords: string[]
  startingPoint: string
  downstreamSpecialty: string
  why: string
}

const CATEGORY_TABLE: CategoryDefinition[] = [
  {
    category: 'chest_cardiac',
    keywords: ['chest', 'heart palpitation', 'palpitations'],
    startingPoint: 'Primary Care Physician',
    downstreamSpecialty: 'Cardiology',
    why: 'Your main symptoms involve the chest or heart.',
  },
  {
    category: 'respiratory',
    keywords: ['breath', 'cough', 'wheeze', 'lung', 'asthma attack'],
    startingPoint: 'Primary Care Physician',
    downstreamSpecialty: 'Pulmonology',
    why: 'Your main symptoms involve breathing or the lungs.',
  },
  {
    category: 'headache_neuro',
    keywords: ['headache', 'migraine', 'numbness', 'tingling', 'seizure', 'dizzy', 'dizziness'],
    startingPoint: 'Primary Care Physician',
    downstreamSpecialty: 'Neurology',
    why: 'Your main symptoms involve a headache or neurological symptoms.',
  },
  {
    category: 'abdominal_digestive',
    keywords: ['stomach', 'abdom', 'belly', 'nausea', 'vomit', 'diarrhea', 'constipat'],
    startingPoint: 'Primary Care Physician',
    downstreamSpecialty: 'Gastroenterology',
    why: 'Your main symptoms involve persistent digestive/abdominal symptoms.',
  },
  {
    category: 'musculoskeletal',
    keywords: ['sprain', 'fracture', 'joint', 'muscle', 'back pain', 'knee', 'ankle', 'wrist', 'fell', 'twisted'],
    startingPoint: 'Urgent Care',
    downstreamSpecialty: 'Orthopedics / Sports Medicine',
    why: 'Your main symptoms involve a bone, joint, or muscle injury.',
  },
  {
    category: 'allergy',
    keywords: ['allergic', 'allergy', 'hives'],
    startingPoint: 'Primary Care Physician',
    downstreamSpecialty: 'Allergy & Immunology',
    why: 'Your main symptoms suggest an allergic reaction.',
  },
  {
    category: 'skin',
    keywords: ['rash', 'skin', 'itch', 'lesion', 'bump'],
    startingPoint: 'Primary Care Physician',
    downstreamSpecialty: 'Dermatology',
    why: 'Your main symptoms involve the skin.',
  },
  {
    category: 'urinary',
    keywords: ['urinat', 'urine', 'bladder', 'burning when i pee', 'uti'],
    startingPoint: 'Primary Care Physician',
    downstreamSpecialty: 'Urology',
    why: 'Your main symptoms involve urination or the bladder.',
  },
  {
    category: 'gynecologic',
    keywords: ['vaginal', 'period', 'menstru', 'pelvic'],
    startingPoint: 'Primary Care Physician',
    downstreamSpecialty: 'OB-GYN',
    why: 'Your main symptoms involve gynecologic symptoms.',
  },
  {
    category: 'eye',
    keywords: ['eye', 'vision'],
    startingPoint: 'Urgent Care',
    downstreamSpecialty: 'Ophthalmology',
    why: 'Your main symptoms involve the eye or vision.',
  },
  {
    category: 'ent',
    keywords: ['ear', 'sore throat', 'nose', 'sinus'],
    startingPoint: 'Primary Care Physician',
    downstreamSpecialty: 'ENT (Ear, Nose & Throat)',
    why: 'Your main symptoms involve the ear, nose, or throat.',
  },
  {
    category: 'endocrine',
    keywords: ['thyroid', 'blood sugar', 'diabet'],
    startingPoint: 'Primary Care Physician',
    downstreamSpecialty: 'Endocrinology',
    why: 'Your main symptoms involve a hormonal or metabolic concern.',
  },
  {
    category: 'rheumatologic',
    keywords: ['arthritis', 'joint stiffness', 'autoimmune'],
    startingPoint: 'Primary Care Physician',
    downstreamSpecialty: 'Rheumatology',
    why: 'Your main symptoms involve joint stiffness or a possible autoimmune concern.',
  },
]

const GENERAL_CATEGORY: CategoryDefinition = {
  category: 'general_unclear',
  keywords: [],
  startingPoint: 'Primary Care Physician / Family Medicine',
  downstreamSpecialty: 'Depends on findings from your first visit',
  why: 'Your symptoms don’t clearly point to one body system yet.',
}

function textFields(intake: IntakeRecord): string {
  return [intake.chiefComplaint?.value, intake.location?.value, intake.character?.value]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function categorizeSymptom(intake: IntakeRecord): CategoryDefinition {
  if (intake.associatedSymptoms.chestPain?.value === 'reported') {
    return CATEGORY_TABLE.find((c) => c.category === 'chest_cardiac')!
  }
  if (intake.associatedSymptoms.severeBreathingDifficulty?.value === 'reported') {
    return CATEGORY_TABLE.find((c) => c.category === 'respiratory')!
  }
  const text = textFields(intake)
  if (text) {
    for (const def of CATEGORY_TABLE) {
      if (def.keywords.some((kw) => text.includes(kw))) return def
    }
  }
  return GENERAL_CATEGORY
}

function careSettingForTier(tier: CareLevelTier): CareSetting {
  switch (tier) {
    case 'EMERGENCY':
      return 'Emergency Department'
    case 'SAME_DAY_URGENT':
      return 'Urgent Care'
    case 'SCHEDULE_SOON':
      return 'Primary care soon'
    case 'SELF_CARE':
      return 'Self-care'
  }
}

function startingProviderFor(tier: CareLevelTier, category: CategoryDefinition): string {
  if (tier === 'EMERGENCY') return 'Emergency Department physician'
  if (tier === 'SAME_DAY_URGENT') {
    return category.startingPoint === 'Urgent Care' ? 'Urgent care clinician' : 'Urgent care clinician'
  }
  return category.startingPoint
}

function urgencyTimeframeFor(tier: CareLevelTier): string {
  switch (tier) {
    case 'EMERGENCY':
      return 'Now'
    case 'SAME_DAY_URGENT':
      return 'Today'
    case 'SCHEDULE_SOON':
      return 'Within the next few days'
    case 'SELF_CARE':
      return 'Monitor at home; seek care if symptoms change'
  }
}

export function routeCare(
  intake: IntakeRecord,
  careLevelOutcome: EngineOutcome<CareLevelResult>,
): EngineOutcome<CareRoutingResult> {
  if (careLevelOutcome.kind === 'INSUFFICIENT_INFORMATION') return careLevelOutcome
  if (careLevelOutcome.kind === 'OUT_OF_SCOPE') return careLevelOutcome

  const tier = careLevelOutcome.result.tier
  const category = categorizeSymptom(intake)

  const why = careLevelOutcome.result.redFlagOverride
    ? `${category.why} This needs immediate evaluation because you reported: ${careLevelOutcome.result.triggeredRedFlags.join(', ')}.`
    : category.why

  return {
    kind: 'RESULT',
    result: {
      careSetting: careSettingForTier(tier),
      bestStartingProvider: startingProviderFor(tier, category),
      possibleDownstreamSpecialty: `${category.downstreamSpecialty}, later, depending on evaluation`,
      category: category.category,
      why,
      urgencyTimeframe: urgencyTimeframeFor(tier),
    },
  }
}
