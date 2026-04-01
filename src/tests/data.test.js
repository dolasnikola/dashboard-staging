import { describe, it, expect } from 'vitest'
import { fmt, fmtMetric, parseCSV, parseCSVLine, detectPlatform, parseNum, mapRow } from '../lib/data'

// ============== fmt ==============

describe('fmt', () => {
  it('returns dash for null/undefined/NaN', () => {
    expect(fmt(null, 'number')).toBe('—')
    expect(fmt(undefined, 'money')).toBe('—')
    expect(fmt(NaN, 'decimal')).toBe('—')
  })

  it('formats numbers with de-DE locale', () => {
    const result = fmt(1234567, 'number')
    expect(result).toMatch(/1.*234.*567/)
  })

  it('formats money without decimals', () => {
    const result = fmt(1500, 'money', 'EUR')
    expect(result).toContain('1.500')
    expect(result).toContain('€')
  })

  it('formats money2 with 2 decimals', () => {
    const result = fmt(12.5, 'money2', 'EUR')
    expect(result).toContain('12,50')
  })

  it('formats percent (multiplies by 100)', () => {
    expect(fmt(0.1234, 'percent')).toBe('12.34%')
  })

  it('formats percent_raw (no multiplication)', () => {
    expect(fmt(12.34, 'percent_raw')).toBe('12.34%')
  })

  it('formats decimal', () => {
    expect(fmt(3.14159, 'decimal')).toBe('3.14')
  })

  it('defaults to String(value)', () => {
    expect(fmt(42, 'unknown')).toBe('42')
  })

  it('uses custom currency', () => {
    const result = fmt(100, 'money', 'RSD')
    expect(result).toMatch(/RSD|din|100/)
  })
})

// ============== fmtMetric ==============

describe('fmtMetric', () => {
  it('formats impressions as number', () => {
    const result = fmtMetric('impressions', 50000)
    expect(result).toMatch(/50.*000/)
  })

  it('formats spend as money2', () => {
    const result = fmtMetric('spend', 1234.56, 'EUR')
    expect(result).toContain('€')
  })

  it('formats ctr as percent_raw', () => {
    expect(fmtMetric('ctr', 3.45)).toBe('3.45%')
  })

  it('defaults to number format', () => {
    const result = fmtMetric('unknown_metric', 999)
    expect(result).toMatch(/999/)
  })
})

// ============== parseNum ==============

describe('parseNum', () => {
  it('returns 0 for empty/null/dash values', () => {
    expect(parseNum('')).toBe(0)
    expect(parseNum(null)).toBe(0)
    expect(parseNum('--')).toBe(0)
    expect(parseNum('N/A')).toBe(0)
  })

  it('parses simple numbers', () => {
    expect(parseNum('123')).toBe(123)
    expect(parseNum('45.67')).toBe(45.67)
  })

  it('strips currency symbols', () => {
    expect(parseNum('€1500')).toBe(1500)
    expect(parseNum('$200.50')).toBe(200.50)
  })

  it('handles European format (1.234,56)', () => {
    expect(parseNum('1.234,56')).toBe(1234.56)
  })

  it('handles comma as decimal separator', () => {
    expect(parseNum('12,34')).toBe(12.34)
  })

  it('strips percent sign', () => {
    expect(parseNum('5.5%')).toBe(5.5)
  })
})

// ============== parseCSVLine ==============

describe('parseCSVLine', () => {
  it('splits simple comma-separated values', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('handles quoted fields', () => {
    expect(parseCSVLine('"hello","world"')).toEqual(['hello', 'world'])
  })

  it('handles commas inside quotes', () => {
    expect(parseCSVLine('"a,b",c')).toEqual(['a,b', 'c'])
  })

  it('handles escaped quotes (double quotes)', () => {
    expect(parseCSVLine('"say ""hello""",b')).toEqual(['say "hello"', 'b'])
  })

  it('handles empty fields', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c'])
  })
})

// ============== parseCSV ==============

describe('parseCSV', () => {
  it('parses simple CSV text', () => {
    const text = 'name,value\nAlice,100\nBob,200'
    const { headers, rows } = parseCSV(text)
    expect(headers).toEqual(['name', 'value'])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ name: 'Alice', value: '100' })
    expect(rows[1]).toEqual({ name: 'Bob', value: '200' })
  })

  it('returns empty for single-line input', () => {
    const { headers, rows } = parseCSV('just_a_header')
    expect(rows).toHaveLength(0)
  })

  it('skips empty lines', () => {
    const text = 'a,b\n1,2\n\n3,4'
    const { rows } = parseCSV(text)
    expect(rows).toHaveLength(2)
  })

  it('handles Windows line endings', () => {
    const text = 'a,b\r\n1,2\r\n3,4'
    const { rows } = parseCSV(text)
    expect(rows).toHaveLength(2)
  })
})

// ============== detectPlatform ==============

describe('detectPlatform', () => {
  it('detects Meta from headers', () => {
    expect(detectPlatform(['Campaign Name', 'Amount Spent', 'Reach'])).toBe('meta')
  })

  it('detects Google Ads from headers', () => {
    expect(detectPlatform(['Campaign', 'Cost', 'Impr.', 'Clicks'])).toBe('google_ads')
  })

  it('detects DV360 from headers', () => {
    expect(detectPlatform(['Insertion Order', 'Impressions', 'Clicks'])).toBe('dv360')
  })

  it('returns null for unrecognized headers', () => {
    expect(detectPlatform(['foo', 'bar', 'baz'])).toBeNull()
  })
})

// ============== mapRow ==============

describe('mapRow', () => {
  it('maps Meta-style row correctly', () => {
    const row = {
      'Campaign Name': 'Brand Campaign',
      'Amount Spent': '€500',
      'Impressions': '10000',
      'Clicks (All)': '200',
      'Reach': '8000',
      'Results': '15',
      'Reporting Starts': '2026-03-01'
    }
    const result = mapRow('meta', row)
    expect(result.campaign).toBe('Brand Campaign')
    expect(result.spend).toBe(500)
    expect(result.impressions).toBe(10000)
    expect(result.clicks).toBe(200)
    expect(result.reach).toBe(8000)
    expect(result.conversions).toBe(15)
    expect(result.ctr).toBeCloseTo(2.0, 1)
    expect(result.cpm).toBeCloseTo(50, 1)
    expect(result.cpc).toBeCloseTo(2.5, 1)
  })

  it('handles zero impressions gracefully', () => {
    const row = { 'Campaign Name': 'Empty', 'Impressions': '0', 'Clicks (All)': '0', 'Amount Spent': '0' }
    const result = mapRow('meta', row)
    expect(result.ctr).toBe(0)
    expect(result.cpm).toBe(0)
  })

  it('handles zero clicks for CPC', () => {
    const row = { 'Campaign': 'Test', 'Impressions': '1000', 'Clicks': '0', 'Cost': '100' }
    const result = mapRow('google_ads', row)
    expect(result.cpc).toBe(0)
  })

  it('calculates CPA when conversions > 0', () => {
    const row = { 'Campaign': 'Test', 'Impressions': '1000', 'Clicks': '50', 'Cost': '200', 'Conv.': '10' }
    const result = mapRow('google_ads', row)
    expect(result.cpa).toBeCloseTo(20, 1)
  })
})
