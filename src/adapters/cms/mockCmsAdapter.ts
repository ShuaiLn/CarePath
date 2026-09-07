import type { CmsAdapter } from './types'
import type { FacilityQualityDetails, CostEstimate, CareTypeLabel } from '../../types/facility'

function hashSeed(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0
  }
  return h
}

const READMISSION_CATEGORIES: FacilityQualityDetails['readmissionRateCategory'][] = [
  'better than national average',
  'no different than national average',
  'worse than national average',
]

const COST_RANGES_BY_CARE_TYPE: Record<CareTypeLabel, { low: number; high: number }> = {
  'Emergency Department': { low: 1200, high: 4800 },
  'Urgent Care': { low: 120, high: 350 },
  'Primary Care': { low: 90, high: 260 },
}

/**
 * Deterministic mock standing in for the CMS Provider Data Catalog and
 * CMS Hospital Price Transparency machine-readable files (see
 * docs/CarePath_AI_Plan.md Section 6). Real integration would fetch and
 * cache these public datasets server-side. Values are seeded off the
 * facility name/category so the same query always returns the same mock
 * numbers within a session, which is enough to demonstrate the UI without
 * implying these are real prices or quality scores.
 */
export class MockCmsAdapter implements CmsAdapter {
  readonly name = 'mock-cms'

  async getQualityDetails(facilityName: string, careType: CareTypeLabel): Promise<FacilityQualityDetails> {
    const seed = hashSeed(facilityName)
    if (careType === 'Primary Care') {
      return {
        source: 'CMS Provider Data Catalog (mock)',
        overallHospitalRatingStars: null,
        edWaitTimeMinutesMedian: null,
        readmissionRateCategory: 'not available',
      }
    }
    return {
      source: 'CMS Provider Data Catalog (mock)',
      overallHospitalRatingStars: Math.round(((seed % 20) / 10 + 3) * 2) / 2,
      edWaitTimeMinutesMedian: careType === 'Emergency Department' ? 20 + (seed % 90) : null,
      readmissionRateCategory: READMISSION_CATEGORIES[seed % READMISSION_CATEGORIES.length],
    }
  }

  async getCostEstimate(category: string, careType: CareTypeLabel): Promise<CostEstimate> {
    const seed = hashSeed(category + careType)
    const base = COST_RANGES_BY_CARE_TYPE[careType]
    const jitter = seed % 100
    const low = Math.round((base.low + jitter) / 10) * 10
    const high = Math.round((base.high + jitter * 2) / 10) * 10
    const completeness = seed % 3 === 0 ? 'low' : seed % 3 === 1 ? 'medium' : 'high'
    return {
      lowUsd: low,
      highUsd: high,
      dataCompleteness: completeness,
      source: 'CMS Hospital Price Transparency (mock)',
    }
  }
}
