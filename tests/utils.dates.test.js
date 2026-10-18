import { getWeekDateRange, isoWeekNumber } from '../src/utils.js'

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

test('week start day is case-insensitive', () => {
  const result = getWeekDateRange('sunday', WED_MAY_13)
  expect(result.dateFrom).toBe('2026-05-10')
  expect(result.dateTo).toBe('2026-05-16')
})

test('week window uses the user utc offset, not UTC', () => {
  // Monday 2026-05-11 01:00 UTC is still Sunday 22:00 in UTC-3, so for that
  // user a Monday-start week is the prior week, not the one starting May 11.
  const monMay11_0100Utc = MON_MAY_11 + 3600000
  const result = getWeekDateRange('Monday', monMay11_0100Utc, -10800)
  expect(result.dateFrom).toBe('2026-05-04')
  expect(result.dateTo).toBe('2026-05-10')
})

test('week label same month', () => {
  const result = getWeekDateRange('Monday', WED_MAY_13)
  expect(result.weekLabel).toBe('May 11 – 17')
})

test('week label spanning two months', () => {
  // Monday 2026-03-30 00:00:00 UTC
  const result = getWeekDateRange('Monday', 1774828800000)
  expect(result.weekLabel).toBe('Mar 30 – Apr 5')
})

// Monday, 2026-08-31 12:00:00 UTC — its week runs into September
const MON_AUG_31 = 1788177600000

test.each([
  ['md', WED_MAY_13, 'May 11 – 17'],
  ['dm', WED_MAY_13, '11 – 17 May'],
  ['md', MON_AUG_31, 'Aug 31 – Sep 6'],
  ['dm', MON_AUG_31, '31 Aug – 6 Sep'],
])('week label in %s format', (dateFormat, now, expected) => {
  expect(getWeekDateRange('Monday', now, 0, dateFormat).weekLabel).toBe(expected)
})

test.each([
  ['2026-01-01', 1],
  ['2026-12-28', 53],
  ['2027-01-01', 53],
  ['2027-01-03', 53],
  ['2027-01-04', 1],
  ['2026-05-11', 20],
])('ISO week number of %s', (isoDate, expected) => {
  expect(isoWeekNumber(new Date(`${isoDate}T00:00:00Z`))).toBe(expected)
})

test('week number for a Sunday-start week follows its Monday', () => {
  const sundayStart = getWeekDateRange('Sunday', WED_MAY_13)
  expect(sundayStart.dateFrom).toBe('2026-05-10')
  expect(sundayStart.weekNumber).toBe(20)
  expect(getWeekDateRange('Monday', WED_MAY_13).weekNumber).toBe(20)
})
