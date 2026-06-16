import { getWeekDateRange } from '../src/utils.js'

// Monday, 2026-05-11 00:00:00 UTC
const MON_MAY_11 = 1778457600000

// Wednesday, 2026-05-13 12:00:00 UTC (mid-week)
const WED_MAY_13 = 1778673600000

// Sunday, 2026-05-10 00:00:00 UTC
const SUN_MAY_10 = 1778371200000

test('week starting Monday, queried on Wednesday', () => {
  const result = getWeekDateRange('Monday', WED_MAY_13)
  expect(result.dateFrom).toBe('2026-05-11')
  expect(result.dateTo).toBe('2026-05-17')
})

test('week starting Monday, queried on Monday', () => {
  const result = getWeekDateRange('Monday', MON_MAY_11)
  expect(result.dateFrom).toBe('2026-05-11')
  expect(result.dateTo).toBe('2026-05-17')
})

test('week starting Sunday, queried on Wednesday', () => {
  const result = getWeekDateRange('Sunday', WED_MAY_13)
  expect(result.dateFrom).toBe('2026-05-10')
  expect(result.dateTo).toBe('2026-05-16')
})

test('week starting Sunday, queried on Sunday', () => {
  const result = getWeekDateRange('Sunday', SUN_MAY_10)
  expect(result.dateFrom).toBe('2026-05-10')
  expect(result.dateTo).toBe('2026-05-16')
})

test('week label same month', () => {
  const result = getWeekDateRange('Monday', WED_MAY_13)
  expect(result.weekLabel).toBe('May 11–17')
})

test('week label spanning two months', () => {
  // Monday 2026-03-30 00:00:00 UTC
  const result = getWeekDateRange('Monday', 1774828800000)
  expect(result.weekLabel).toBe('Mar 30 – Apr 5')
})
