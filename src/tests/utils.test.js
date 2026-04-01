import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock cache module before importing utils
vi.mock('../lib/cache', () => ({
  dbGetCampaignData: vi.fn(() => []),
  dbGetAllCampaignDataForPlatform: vi.fn(() => [])
}))

import { dbGetCampaignData, dbGetAllCampaignDataForPlatform } from '../lib/cache'
import {
  getDateRangeBounds, getMonthsInRange, getCurrentMonth,
  aggregateByCampaign, groupByProduct, getMoMChange, getDailyTotals,
  getFilteredData
} from '../lib/utils'

// ============== getDateRangeBounds ==============

describe('getDateRangeBounds', () => {
  it('returns current month bounds for this_month', () => {
    const result = getDateRangeBounds('this_month')
    const now = new Date()
    expect(result.from.getMonth()).toBe(now.getMonth())
    expect(result.from.getDate()).toBe(1)
    expect(result.month).toMatch(/^\d{4}-\d{2}$/)
  })

  it('returns last month bounds', () => {
    const result = getDateRangeBounds('last_month')
    const now = new Date()
    const expectedMonth = now.getMonth() === 0 ? 12 : now.getMonth()
    expect(result.from.getDate()).toBe(1)
    expect(result.to.getDate()).toBeGreaterThan(27) // last day of month
    expect(result.month).toBeDefined()
  })

  it('returns yesterday bounds', () => {
    const result = getDateRangeBounds('yesterday')
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(result.from.getDate()).toBe(yesterday.getDate())
  })

  it('returns last_7 days range', () => {
    const result = getDateRangeBounds('last_7')
    expect(result.month).toBeNull()
    const diffMs = result.to - result.from
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeCloseTo(6, 0)
  })

  it('returns last_30 days range', () => {
    const result = getDateRangeBounds('last_30')
    expect(result.month).toBeNull()
    const diffMs = result.to - result.from
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeCloseTo(29, 0)
  })

  it('returns all range from 2020', () => {
    const result = getDateRangeBounds('all')
    expect(result.from.getFullYear()).toBe(2020)
    expect(result.allMonths).toBe(true)
  })

  it('handles custom range', () => {
    const result = getDateRangeBounds('custom', '2026-01-01', '2026-01-31')
    expect(result.from.getFullYear()).toBe(2026)
    expect(result.to.getMonth()).toBe(0)
  })

  it('defaults to this_month for unknown range', () => {
    const result = getDateRangeBounds('nonexistent')
    expect(result.from.getDate()).toBe(1)
    expect(result.month).toBeDefined()
  })
})

// ============== getMonthsInRange ==============

describe('getMonthsInRange', () => {
  it('returns single month for same-month range', () => {
    const result = getMonthsInRange(new Date(2026, 0, 1), new Date(2026, 0, 31))
    expect(result).toEqual(['2026-01'])
  })

  it('returns multiple months for cross-month range', () => {
    const result = getMonthsInRange(new Date(2026, 0, 15), new Date(2026, 2, 10))
    expect(result).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('handles year boundary', () => {
    const result = getMonthsInRange(new Date(2025, 11, 1), new Date(2026, 1, 1))
    expect(result).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})

// ============== getCurrentMonth ==============

describe('getCurrentMonth', () => {
  it('returns YYYY-MM format', () => {
    const result = getCurrentMonth()
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })
})

// ============== getFilteredData ==============

describe('getFilteredData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses dbGetAllCampaignDataForPlatform for "all" range', () => {
    dbGetAllCampaignDataForPlatform.mockReturnValue([{ spend: 100 }])
    const result = getFilteredData('nlb', 'meta', 'all')
    expect(dbGetAllCampaignDataForPlatform).toHaveBeenCalledWith('nlb', 'meta')
    expect(result).toHaveLength(1)
  })

  it('uses dbGetCampaignData for single-month range', () => {
    dbGetCampaignData.mockReturnValue([{ spend: 50, date: '2026-03-15' }])
    const result = getFilteredData('nlb', 'meta', 'this_month')
    expect(dbGetCampaignData).toHaveBeenCalled()
  })
})

// ============== aggregateByCampaign ==============

describe('aggregateByCampaign', () => {
  it('aggregates rows by campaign name', () => {
    const rows = [
      { campaign: 'Campaign A', impressions: 100, clicks: 10, spend: 50, reach: 80, conversions: 2, conv_value: 100 },
      { campaign: 'Campaign A', impressions: 200, clicks: 20, spend: 100, reach: 150, conversions: 3, conv_value: 200 },
      { campaign: 'Campaign B', impressions: 300, clicks: 30, spend: 75, reach: 200, conversions: 5, conv_value: 300 }
    ]
    const result = aggregateByCampaign(rows)
    expect(result).toHaveLength(2)

    const a = result.find(r => r.campaign === 'Campaign A')
    expect(a.impressions).toBe(300)
    expect(a.clicks).toBe(30)
    expect(a.spend).toBe(150)
    expect(a.conversions).toBe(5)
  })

  it('calculates derived metrics correctly', () => {
    const rows = [
      { campaign: 'Test', impressions: 1000, clicks: 50, spend: 200, reach: 0, conversions: 10, conv_value: 0 }
    ]
    const result = aggregateByCampaign(rows)
    expect(result[0].ctr).toBeCloseTo(5.0, 1)
    expect(result[0].cpm).toBeCloseTo(200, 0)
    expect(result[0].cpc).toBeCloseTo(4.0, 1)
    expect(result[0].cpa).toBeCloseTo(20, 1)
  })

  it('handles zero impressions/clicks gracefully', () => {
    const rows = [
      { campaign: 'Zero', impressions: 0, clicks: 0, spend: 0, reach: 0, conversions: 0, conv_value: 0 }
    ]
    const result = aggregateByCampaign(rows)
    expect(result[0].ctr).toBe(0)
    expect(result[0].cpm).toBe(0)
    expect(result[0].cpc).toBe(0)
    expect(result[0].cpa).toBe(0)
  })

  it('uses insertion_order as key when present', () => {
    const rows = [
      { campaign: 'Camp', insertion_order: 'IO-1', impressions: 100, clicks: 5, spend: 10, reach: 0, conversions: 0, conv_value: 0 },
      { campaign: 'Camp', insertion_order: 'IO-1', impressions: 100, clicks: 5, spend: 10, reach: 0, conversions: 0, conv_value: 0 }
    ]
    const result = aggregateByCampaign(rows)
    expect(result).toHaveLength(1)
    expect(result[0].impressions).toBe(200)
  })
})

// ============== groupByProduct ==============

describe('groupByProduct', () => {
  it('groups NLB campaigns by product keywords', () => {
    const rows = [
      { campaign: 'NLB PMax Stambeni krediti' },
      { campaign: 'NLB Search Kes krediti' },
      { campaign: 'NLB Display Banner' } // not pmax/search — skipped
    ]
    const result = groupByProduct(rows)
    expect(result['stambeni']).toHaveLength(1)
    expect(result['kes']).toHaveLength(1)
    expect(result['ostalo']).toBeUndefined() // Display Banner skipped
  })

  it('puts unmatched pmax/search campaigns in ostalo', () => {
    const rows = [
      { campaign: 'NLB PMax Unknown Product' }
    ]
    const result = groupByProduct(rows)
    expect(result['ostalo']).toHaveLength(1)
  })

  it('removes empty groups', () => {
    const rows = [
      { campaign: 'NLB Search Stambeni' }
    ]
    const result = groupByProduct(rows)
    expect(result['stambeni']).toHaveLength(1)
    expect(result['kes']).toBeUndefined()
    expect(result['refinansiranje']).toBeUndefined()
  })
})

// ============== getMoMChange ==============

describe('getMoMChange', () => {
  it('returns null when no previous data', () => {
    expect(getMoMChange('spend', 100, null)).toBeNull()
    expect(getMoMChange('spend', 100, {})).toBeNull()
    expect(getMoMChange('spend', 100, { spend: 0 })).toBeNull()
  })

  it('calculates positive change correctly', () => {
    const result = getMoMChange('spend', 150, { spend: 100 })
    expect(result.change).toBeCloseTo(50, 0)
    expect(result.arrow).toBe('▲')
    expect(result.cls).toBe('positive') // more spend is "positive" for non-inverted
  })

  it('calculates negative change correctly', () => {
    const result = getMoMChange('clicks', 50, { clicks: 100 })
    expect(result.change).toBeCloseTo(-50, 0)
    expect(result.arrow).toBe('▼')
    expect(result.cls).toBe('negative')
  })

  it('inverts logic for cost metrics (cpa, cpm, cpc)', () => {
    // CPA going down is GOOD
    const result = getMoMChange('cpa', 5, { cpa: 10 })
    expect(result.change).toBeCloseTo(-50, 0)
    expect(result.isGood).toBe(true)
    expect(result.cls).toBe('positive')
  })

  it('marks near-zero changes as neutral', () => {
    const result = getMoMChange('spend', 100.3, { spend: 100 })
    expect(result.cls).toBe('neutral')
  })

  it('includes label', () => {
    const result = getMoMChange('spend', 200, { spend: 100 }, 'vs prošli mesec')
    expect(result.label).toBe('vs prošli mesec')
  })
})

// ============== getDailyTotals ==============

describe('getDailyTotals', () => {
  it('aggregates rows by date', () => {
    const rows = [
      { date: '2026-03-01', impressions: 100, clicks: 10, spend: 50 },
      { date: '2026-03-01', impressions: 200, clicks: 20, spend: 100 },
      { date: '2026-03-02', impressions: 150, clicks: 15, spend: 75 }
    ]
    const result = getDailyTotals(rows, ['impressions', 'clicks', 'spend'])
    expect(result).toHaveLength(2)
    expect(result[0].impressions).toBe(300)
    expect(result[0].clicks).toBe(30)
    expect(result[0]._date).toBe('2026-03-01')
    expect(result[1]._date).toBe('2026-03-02')
  })

  it('calculates derived metrics when requested', () => {
    const rows = [
      { date: '2026-03-01', impressions: 1000, clicks: 50, spend: 200, conversions: 10 }
    ]
    const result = getDailyTotals(rows, ['impressions', 'clicks', 'spend', 'conversions', 'ctr', 'cpm', 'cpc', 'cpa'])
    expect(result[0].ctr).toBeCloseTo(5.0, 1)
    expect(result[0].cpm).toBeCloseTo(200, 0)
    expect(result[0].cpc).toBeCloseTo(4.0, 1)
    expect(result[0].cpa).toBeCloseTo(20, 1)
  })

  it('returns sorted by date', () => {
    const rows = [
      { date: '2026-03-05', impressions: 1 },
      { date: '2026-03-01', impressions: 2 },
      { date: '2026-03-03', impressions: 3 }
    ]
    const result = getDailyTotals(rows, ['impressions'])
    expect(result[0]._date).toBe('2026-03-01')
    expect(result[1]._date).toBe('2026-03-03')
    expect(result[2]._date).toBe('2026-03-05')
  })

  it('skips rows without dates', () => {
    const rows = [
      { date: '2026-03-01', impressions: 100 },
      { impressions: 50 },
      { date: '', impressions: 25 }
    ]
    const result = getDailyTotals(rows, ['impressions'])
    expect(result).toHaveLength(1)
  })
})
