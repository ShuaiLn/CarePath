import type { MedicationAdapter } from './types'
import type { MedicationInfo } from '../../types/medication'

interface KnownMedication {
  rxcui: string
  normalizedName: string
  genericName: string | null
  commonUses: string[]
  commonSideEffects: string[]
  labelWarnings: string[]
}

/**
 * Small fixture standing in for RxNorm identifier lookup + DailyMed label
 * data (see docs/CarePath_AI_Plan.md Section 8). A real implementation
 * calls the NLM RxNorm and DailyMed public APIs through a backend proxy.
 * This never invents a dosage recommendation — `MedicationInfo` has no
 * field for one, and none of these fixtures include one.
 */
const KNOWN_MEDICATIONS: KnownMedication[] = [
  {
    rxcui: '723',
    normalizedName: 'Amoxicillin',
    genericName: 'amoxicillin',
    commonUses: ['Bacterial infections (e.g. ear, throat, sinus, urinary tract)'],
    commonSideEffects: ['Nausea', 'Diarrhea', 'Rash'],
    labelWarnings: ['Tell your doctor about any penicillin allergy before taking this.'],
  },
  {
    rxcui: '7646',
    normalizedName: 'Omeprazole',
    genericName: 'omeprazole',
    commonUses: ['Acid reflux / GERD', 'Stomach ulcers'],
    commonSideEffects: ['Headache', 'Stomach pain', 'Nausea'],
    labelWarnings: ['Long-term use has been associated with certain risks; follow your prescriber’s guidance on duration.'],
  },
  {
    rxcui: '5640',
    normalizedName: 'Ibuprofen',
    genericName: 'ibuprofen',
    commonUses: ['Pain relief', 'Fever reduction', 'Inflammation'],
    commonSideEffects: ['Stomach upset', 'Heartburn'],
    labelWarnings: ['May increase risk of stomach bleeding, especially with long-term use or alcohol.'],
  },
  {
    rxcui: '6809',
    normalizedName: 'Metformin',
    genericName: 'metformin',
    commonUses: ['Type 2 diabetes / blood sugar control'],
    commonSideEffects: ['Nausea', 'Diarrhea', 'Stomach upset'],
    labelWarnings: ['Rare but serious risk of lactic acidosis; contact your doctor if you have unusual muscle pain or trouble breathing.'],
  },
  {
    rxcui: '29046',
    normalizedName: 'Lisinopril',
    genericName: 'lisinopril',
    commonUses: ['High blood pressure', 'Heart failure'],
    commonSideEffects: ['Dry cough', 'Dizziness'],
    labelWarnings: ['Avoid use during pregnancy.'],
  },
  {
    rxcui: '83367',
    normalizedName: 'Atorvastatin',
    genericName: 'atorvastatin',
    commonUses: ['High cholesterol'],
    commonSideEffects: ['Muscle aches', 'Digestive issues'],
    labelWarnings: ['Report unexplained muscle pain, tenderness, or weakness to your doctor.'],
  },
  {
    rxcui: '161',
    normalizedName: 'Acetaminophen',
    genericName: 'acetaminophen',
    commonUses: ['Pain relief', 'Fever reduction'],
    commonSideEffects: ['Rare at normal doses'],
    labelWarnings: ['Exceeding the labeled dose can cause serious liver damage. Check other products for acetaminophen to avoid doubling up.'],
  },
]

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

export class MockMedicationAdapter implements MedicationAdapter {
  readonly name = 'mock-rxnorm-dailymed'

  async lookup(query: string): Promise<MedicationInfo> {
    const q = normalize(query)
    const match = KNOWN_MEDICATIONS.find((m) => normalize(m.normalizedName) === q || q.includes(normalize(m.genericName ?? '')))

    const pharmacistQuestions = [
      'Are there any interactions with my other medications or supplements?',
      'What should I do if I miss a dose?',
      'Are there foods, drinks, or activities I should avoid while taking this?',
    ]

    if (!match) {
      return {
        queryText: query,
        rxcui: null,
        normalizedName: query,
        genericName: null,
        commonUses: [],
        commonSideEffects: [],
        labelWarnings: [],
        pharmacistQuestions,
        source: 'RxNorm + DailyMed (mock)',
        found: false,
      }
    }

    return {
      queryText: query,
      rxcui: match.rxcui,
      normalizedName: match.normalizedName,
      genericName: match.genericName,
      commonUses: match.commonUses,
      commonSideEffects: match.commonSideEffects,
      labelWarnings: match.labelWarnings,
      pharmacistQuestions,
      source: 'RxNorm + DailyMed (mock)',
      found: true,
    }
  }
}
