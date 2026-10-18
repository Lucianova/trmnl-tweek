import { readFileSync } from 'node:fs'

// The transform is a self-contained TRMNL script with no exports; load it with its
// entry point exposed so run() can be exercised on a polled response.
const src = readFileSync(new URL('../tweek/src/transform.js', import.meta.url), 'utf8')
const { run } = await import('data:text/javascript;base64,' + Buffer.from(src + '\nexport { run }').toString('base64'))

// Wednesday, 2026-05-13 12:00:00 UTC
const WED_MAY_13 = 1778673600000

const createInput = (response, customFields = {}) => ({
  ...response,
  trmnl: {
    user: { utc_offset: 0 },
    plugin_settings: {
      custom_fields_values: { calendar_id: 'aB3xK9mQ2pL7rT5vN1wZ', week_start_day: 'monday', time_format: '24h', ...customFields },
    },
  },
})

test('polled tasks outside the current week', () => {
  vi.useFakeTimers({ now: WED_MAY_13 })
  onTestFinished(() => vi.useRealTimers())
  const response = {
    data: [
      { text: 'Last week', date: '2026-05-08', gcal: false, done: false },
      { text: 'This week', date: '2026-05-13', gcal: false, done: false },
      { text: 'Next week', date: '2026-05-19', gcal: false, done: false },
    ],
    nextDocId: null,
  }

  const result = run(createInput(response))

  expect(result.error).toBeNull()
  expect(result.week_label).toBe('May 11–17')
  expect(result.days.flatMap(d => d.tasks.map(t => t.text))).toEqual(['This week'])
})

test('polled Tweek error body', () => {
  const result = run(createInput({ message: 'Calendar not found', error: 'Not Found', statusCode: 404 }))
  expect(result).toEqual({
    week_label: '',
    days: [],
    error: 'Calendar not found — check your Calendar ID in the plugin settings.',
  })
})

test('blank Calendar ID', () => {
  const result = run(createInput({ data: [] }, { calendar_id: '   ' }))
  expect(result.error).toBe('Add your Tweek Calendar ID in the plugin settings.')
})

test('input without plugin settings', () => {
  expect(run({ data: [] }).error).toBe("Couldn't reach Tweek. It will retry on the next refresh.")
})

test('completed tasks with show_completed turned off', () => {
  vi.useFakeTimers({ now: WED_MAY_13 })
  onTestFinished(() => vi.useRealTimers())
  const response = {
    data: [
      { text: 'Done', date: '2026-05-13', gcal: false, done: true },
      { text: 'Open', date: '2026-05-13', gcal: false, done: false },
    ],
  }

  const texts = settings => run(createInput(response, settings)).days.flatMap(d => d.tasks.map(t => t.text))

  expect(texts({ show_completed: 'false' })).toEqual(['Open'])
  expect(texts({ show_completed: true })).toEqual(['Done', 'Open'])
  expect(texts({})).toEqual(['Done', 'Open'])
})

test('day/month dates and the week number', () => {
  vi.useFakeTimers({ now: WED_MAY_13 })
  onTestFinished(() => vi.useRealTimers())

  const result = run(createInput({ data: [] }, { date_format: 'dm', show_week_number: 'true' }))

  expect(result.week_label).toBe('11–17 May — Week 20')
  expect(result.days[0].date_label).toBe('11/5')
})

test('date format and week number defaults', () => {
  vi.useFakeTimers({ now: WED_MAY_13 })
  onTestFinished(() => vi.useRealTimers())

  const result = run(createInput({ data: [] }))

  expect(result.week_label).toBe('May 11–17')
  expect(result.days[0].date_label).toBe('5/11')
})
