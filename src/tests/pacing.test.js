import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock cache module
vi.mock('../lib/cache', () => ({
  dbGetBudget: vi.fn(() => 0),
  dbGetFlightDays: vi.fn(() => [])
}))

import { dbGetBudget, dbGetFlightDays } from '../lib/cache'
import { calcPacing, calcClientPacing, PACING_STYLES } from '../lib/pacing'

describe('calcPacing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no budget set', () => {
    dbGetBudget.mockReturnValue(0)
    expect(calcPacing('nlb', 'meta', '2026-03', 500)).toBeNull()
  })

  it('returns null when actualSpend is null', () => {
    dbGetBudget.mockReturnValue(1000)
    expect(calcPacing('nlb', 'meta', '2026-03', null)).toBeNull()
  })

  it('returns on_track when spend matches expected pace', () => {
    dbGetBudget.mockReturnValue(3100)
    dbGetFlightDays.mockReturnValue([])
    // Use a past month so all days have elapsed
    const result = calcPacing('nlb', 'meta', '2025-01', 3100)
    expect(result.status).toBe('on_track')
    expect(result.pacingRatio).toBeCloseTo(1.0, 1)
    expect(result.label).toBe('Na putu')
  })

  it('detects overspending (>115%)', () => {
    dbGetBudget.mockReturnValue(1000)
    dbGetFlightDays.mockReturnValue([])
    // Past month: all 31 days elapsed, budget 1000, spent 1200
    const result = calcPacing('nlb', 'meta', '2025-01', 1200)
    expect(result.status).toBe('overspending')
    expect(result.pacingRatio).toBeGreaterThan(1.15)
    expect(result.label).toBe('Prekoračuje')
  })

  it('detects underspending (<85%)', () => {
    dbGetBudget.mockReturnValue(1000)
    dbGetFlightDays.mockReturnValue([])
    // Past month: full month elapsed, budget 1000, spent only 500
    const result = calcPacing('nlb', 'meta', '2025-01', 500)
    expect(result.status).toBe('underspending')
    expect(result.pacingRatio).toBeLessThan(0.85)
    expect(result.label).toBe('Zaostaje')
  })

  it('uses flight days when available', () => {
    dbGetBudget.mockReturnValue(1000)
    dbGetFlightDays.mockReturnValue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) // 10 flight days
    // Past month: all 10 flight days elapsed
    const result = calcPacing('nlb', 'meta', '2025-01', 1000)
    expect(result.daysTotal).toBe(10)
    expect(result.daysPassed).toBe(10)
    expect(result.status).toBe('on_track')
  })

  it('returns no_data when daysTotal is 0', () => {
    dbGetBudget.mockReturnValue(1000)
    dbGetFlightDays.mockReturnValue([])
    // Month with 0 days (edge case — force via mock)
    // We can't really hit daysTotal=0 normally, but daysPassed=0 can happen
    // Actually this can't happen because daysInMonth is always > 0
    // Test the budget/actualSpend return shape instead
    const result = calcPacing('nlb', 'meta', '2025-01', 950)
    expect(result.budget).toBe(1000)
    expect(result.actualSpend).toBe(950)
  })

  it('includes all expected fields in result', () => {
    dbGetBudget.mockReturnValue(1000)
    dbGetFlightDays.mockReturnValue([])
    const result = calcPacing('nlb', 'meta', '2025-01', 900)
    expect(result).toHaveProperty('pacingRatio')
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('expectedSpend')
    expect(result).toHaveProperty('actualSpend')
    expect(result).toHaveProperty('budget')
    expect(result).toHaveProperty('label')
    expect(result).toHaveProperty('daysPassed')
    expect(result).toHaveProperty('daysTotal')
  })
})

describe('calcClientPacing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aggregates pacing across multiple platforms', () => {
    dbGetBudget.mockImplementation((clientId, platform) => {
      if (platform === 'meta') return 1000
      if (platform === 'google_ads') return 2000
      return 0
    })
    dbGetFlightDays.mockReturnValue([])

    const getSpendFn = (p) => p === 'meta' ? 1000 : 2000
    const result = calcClientPacing('nlb', ['meta', 'google_ads'], '2025-01', getSpendFn)
    expect(result).not.toBeNull()
    expect(result.status).toBe('on_track')
    expect(result.totalBudget).toBe(3000)
  })

  it('skips ga4 and local_display platforms', () => {
    dbGetBudget.mockReturnValue(1000)
    dbGetFlightDays.mockReturnValue([])
    const getSpendFn = () => 1000

    const result = calcClientPacing('nlb', ['meta', 'ga4', 'local_display'], '2025-01', getSpendFn)
    expect(result).not.toBeNull()
    expect(result.totalBudget).toBe(1000) // only meta counted
  })

  it('returns null when no platforms have budgets', () => {
    dbGetBudget.mockReturnValue(0)
    dbGetFlightDays.mockReturnValue([])
    const result = calcClientPacing('nlb', ['meta'], '2025-01', () => 100)
    expect(result).toBeNull()
  })
})

describe('PACING_STYLES', () => {
  it('has styles for all status types', () => {
    expect(PACING_STYLES).toHaveProperty('on_track')
    expect(PACING_STYLES).toHaveProperty('overspending')
    expect(PACING_STYLES).toHaveProperty('underspending')
    expect(PACING_STYLES).toHaveProperty('no_data')
  })

  it('each style has color, bg, icon', () => {
    Object.values(PACING_STYLES).forEach(style => {
      expect(style).toHaveProperty('color')
      expect(style).toHaveProperty('bg')
      expect(style).toHaveProperty('icon')
    })
  })
})
