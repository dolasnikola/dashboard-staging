// ============== BUDGET PACING ==============
// Calculates whether spend is on track vs monthly budget,
// accounting for flight days (active campaign days).

import { dbGetBudget, dbGetFlightDays } from './cache'

/**
 * Calculate budget pacing for a client/platform/month.
 * @returns {{ pacingRatio, status, expectedSpend, actualSpend, label, daysPassed, daysTotal }}
 */
export function calcPacing(clientId, platform, month, actualSpend) {
  const budget = dbGetBudget(clientId, platform, month)
  if (budget <= 0 || actualSpend == null) {
    return null // No budget set — pacing not applicable
  }

  const today = new Date()
  const [year, mon] = month.split('-').map(Number)
  const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === mon
  const daysInMonth = new Date(year, mon, 0).getDate()
  const currentDay = today.getDate()

  const flightDays = dbGetFlightDays(clientId, month)

  let daysPassed, daysTotal

  if (flightDays.length > 0) {
    daysTotal = flightDays.length
    if (isCurrentMonth) {
      daysPassed = flightDays.filter(d => d <= currentDay).length
    } else {
      daysPassed = daysTotal // Past month — all days elapsed
    }
  } else {
    daysTotal = daysInMonth
    daysPassed = isCurrentMonth ? currentDay : daysInMonth
  }

  if (daysTotal === 0 || daysPassed === 0) {
    return { pacingRatio: 0, status: 'no_data', expectedSpend: 0, actualSpend, budget, label: '—', daysPassed: 0, daysTotal }
  }

  const expectedSpendRatio = daysPassed / daysTotal
  const expectedSpend = budget * expectedSpendRatio
  const pacingRatio = expectedSpend > 0 ? (actualSpend / expectedSpend) : 0

  let status, label
  if (pacingRatio > 1.15) {
    status = 'overspending'
    label = 'Prekoračuje'
  } else if (pacingRatio < 0.85) {
    status = 'underspending'
    label = 'Zaostaje'
  } else {
    status = 'on_track'
    label = 'Na putu'
  }

  return { pacingRatio, status, expectedSpend, actualSpend, budget, label, daysPassed, daysTotal }
}

/**
 * Aggregate pacing across all platforms for a client (homepage use).
 */
export function calcClientPacing(clientId, platforms, month, getSpendFn) {
  let totalSpend = 0, totalBudget = 0, totalExpected = 0
  let hasBudget = false

  platforms.forEach(p => {
    if (p === 'ga4' || p === 'local_display') return
    const spend = getSpendFn(p)
    const pacing = calcPacing(clientId, p, month, spend)
    if (pacing && pacing.budget > 0) {
      hasBudget = true
      totalSpend += pacing.actualSpend
      totalBudget += pacing.budget
      totalExpected += pacing.expectedSpend
    }
  })

  if (!hasBudget || totalExpected === 0) return null

  const pacingRatio = totalSpend / totalExpected
  let status, label
  if (pacingRatio > 1.15) {
    status = 'overspending'
    label = 'Prekoračuje'
  } else if (pacingRatio < 0.85) {
    status = 'underspending'
    label = 'Zaostaje'
  } else {
    status = 'on_track'
    label = 'Na putu'
  }

  return { pacingRatio, status, label, totalSpend, totalBudget, totalExpected }
}

/** Color/style helpers for pacing status */
export const PACING_STYLES = {
  on_track:      { color: '#16a34a', bg: 'rgba(22,163,74,0.10)',  icon: '●' },
  overspending:  { color: '#dc2626', bg: 'rgba(220,38,38,0.10)',  icon: '▲' },
  underspending: { color: '#d97706', bg: 'rgba(217,119,6,0.10)',  icon: '▼' },
  no_data:       { color: '#9ca3af', bg: 'rgba(156,163,175,0.08)', icon: '—' }
}
