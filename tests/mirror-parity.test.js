import { readFileSync } from 'node:fs'
import * as utils from '../src/utils.js'

// tweek/src/transform.js must be self-contained for TRMNL, so it hand-copies the
// pure functions from src/utils.js. Load those copies (the file has no exports of
// its own) and assert they behave identically — this fails if the two drift, so
// the "keep in sync" note can't silently rot. Importing only executes top-level
// const/function declarations; no fetch runs.
const src = readFileSync(new URL('../tweek/src/transform.js', import.meta.url), 'utf8')
const dataUrl =
  'data:text/javascript;base64,' +
  Buffer.from(src + '\nexport { getWeekDateRange, formatTime, groupTasksByDay }').toString('base64')
const mirror = await import(dataUrl)

const SAMPLE_TASKS = [
  { text: 'All day', date: '2026-05-12', isoDate: null, gcal: true, done: false },
  { text: 'Standup', date: '2026-05-12', isoDate: '2026-05-12T09:00:00-03:00', gcal: true, done: true },
  { text: 'Buy milk', date: '2026-05-13', gcal: false, done: false },
]

test.each([
  ['Monday', 1778673600000, 0],
  ['sunday', 1778673600000, 0],
  ['Monday', 1778461200000, -10800],
])('getWeekDateRange parity (%s, %i, offset %i)', (day, now, off) => {
  expect(mirror.getWeekDateRange(day, now, off)).toEqual(utils.getWeekDateRange(day, now, off))
})

test.each([
  ['2026-05-12T19:00:00-03:00', '24h'],
  ['2026-05-12T09:30:00-03:00', '12h'],
  ['2026-05-12T00:00:00-03:00', '12h'],
])('formatTime parity (%s, %s)', (iso, fmt) => {
  expect(mirror.formatTime(iso, fmt)).toBe(utils.formatTime(iso, fmt))
})

test('groupTasksByDay parity', () => {
  expect(mirror.groupTasksByDay(SAMPLE_TASKS, '2026-05-11', '12h')).toEqual(
    utils.groupTasksByDay(SAMPLE_TASKS, '2026-05-11', '12h'),
  )
})
