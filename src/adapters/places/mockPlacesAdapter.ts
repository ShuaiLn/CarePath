import type { PlacesAdapter, FacilitySearchQuery } from './types'
import type { FacilityCard, CareTypeLabel } from '../../types/facility'
import { getCmsAdapter } from '../cms'

interface MockFacilitySeed {
  name: string
  services: string[]
}

const FACILITY_SEEDS_BY_CARE_TYPE: Record<CareTypeLabel, MockFacilitySeed[]> = {
  'Emergency Department': [
    { name: 'Riverside General Hospital — Emergency Dept.', services: ['24/7 emergency care', 'Trauma center', 'Imaging on-site'] },
    { name: 'St. Mary Medical Center — Emergency Dept.', services: ['24/7 emergency care', 'Cardiac care unit'] },
    { name: 'Lakeview Regional — Emergency Dept.', services: ['24/7 emergency care', 'Pediatric ED'] },
  ],
  'Urgent Care': [
    { name: 'CarePoint Urgent Care', services: ['Walk-in visits', 'X-ray on-site', 'Minor injury care'] },
    { name: 'QuickHealth Urgent Care Clinic', services: ['Walk-in visits', 'Lab testing'] },
    { name: 'Neighborhood Urgent Care', services: ['Walk-in visits', 'Evening hours'] },
  ],
  'Primary Care': [
    { name: 'Downtown Family Medicine', services: ['Same-week appointments', 'Telehealth available'] },
    { name: 'Green Street Primary Care', services: ['New patients welcome', 'Telehealth available'] },
    { name: 'Harborview Community Health', services: ['Sliding-scale fees', 'Same-week appointments'] },
  ],
}

function hashSeed(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

/**
 * Deterministic mock standing in for the Google Places API (see
 * docs/CarePath_AI_Plan.md Section 6 and Section 12 — a real
 * implementation calls Google Places through a backend proxy so the API
 * key never lives client-side). Produces the minimal MVP facility card
 * shape and computes the internal-only "CarePath Match" ranking used
 * purely to order/select results — the composite number itself is never
 * part of the returned card; only the qualitative "whyThisFits" reasons
 * and the resulting order are.
 */
export class MockPlacesAdapter implements PlacesAdapter {
  readonly name = 'mock-google-places'

  async searchFacilities(query: FacilitySearchQuery): Promise<FacilityCard[]> {
    const cms = getCmsAdapter()
    const seeds = FACILITY_SEEDS_BY_CARE_TYPE[query.careType]

    const scored = await Promise.all(
      seeds.map(async (seed, index) => {
        const seedNum = hashSeed(seed.name)
        const distanceMiles = Math.round(((seedNum % 40) / 10 + 0.5 + index * 0.7) * 10) / 10
        const openNow = seedNum % 5 !== 0
        const patientRating = Math.round(((seedNum % 15) / 10 + 3.5) * 10) / 10
        const relevantDepartmentAvailable = seedNum % 3 !== 0

        const [qualityDetails, costEstimate] = await Promise.all([
          cms.getQualityDetails(seed.name, query.careType),
          cms.getCostEstimate(query.category, query.careType),
        ])

        // Internal-only ranking heuristic ("CarePath Match" — Section 6).
        // Never returned to the caller as a number; used only to sort.
        let internalMatchScore = 0
        internalMatchScore += relevantDepartmentAvailable ? 30 : 10
        internalMatchScore += 25 // "appropriate care level" — this query already targeted the right careType
        internalMatchScore += Math.max(0, 15 - distanceMiles * 3)
        internalMatchScore += qualityDetails.readmissionRateCategory !== 'not available' ? 15 : 0
        internalMatchScore += (patientRating - 3) * 5
        internalMatchScore += openNow ? 10 : 0

        const whyThisFits: string[] = []
        if (query.careType === 'Emergency Department') whyThisFits.push('Has emergency services')
        whyThisFits.push(`${distanceMiles} miles away`)
        if (openNow) whyThisFits.push('Open now')
        if (relevantDepartmentAvailable) whyThisFits.push('Relevant department available')
        if (qualityDetails.readmissionRateCategory !== 'not available') whyThisFits.push('CMS quality data available')

        const card: FacilityCard = {
          id: `${query.careType}-${index}-${seedNum}`,
          name: seed.name,
          careType: query.careType,
          distanceMiles,
          openNow,
          hoursSummary: query.careType === 'Emergency Department' ? 'Open 24 hours' : openNow ? 'Open now · closes 8:00 PM' : 'Closed · opens 9:00 AM',
          relevantServices: seed.services,
          patientRating,
          whyThisFits,
          qualityDetails,
          costEstimate,
        }
        return { card, internalMatchScore }
      }),
    )

    return scored.sort((a, b) => b.internalMatchScore - a.internalMatchScore).map((s) => s.card)
  }
}
