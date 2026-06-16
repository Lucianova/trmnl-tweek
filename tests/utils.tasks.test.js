import { formatTime, groupTasksByDay, findCalendar } from '../src/utils.js'

// --- formatTime ---

test('formatTime 24h', () => {
  expect(formatTime('2026-05-12T19:00:00-03:00', '24h')).toBe('19:00')
})

test('formatTime 12h afternoon', () => {
  expect(formatTime('2026-05-12T19:00:00-03:00', '12h')).toBe('7:00 PM')
})

test('formatTime 12h morning', () => {
  expect(formatTime('2026-05-12T09:30:00-03:00', '12h')).toBe('9:30 AM')
})

test('formatTime 12h midnight', () => {
  expect(formatTime('2026-05-12T00:00:00-03:00', '12h')).toBe('12:00 AM')
})

test('formatTime 12h noon', () => {
  expect(formatTime('2026-05-12T12:00:00-03:00', '12h')).toBe('12:00 PM')
})

// --- groupTasksByDay ---

const SAMPLE_TASKS = [
  { text: 'Morning run', date: '2026-05-11', gcal: false, done: false },
  { text: 'Team sync', date: '2026-05-11', gcal: false, done: true },
  { text: 'Dinner', date: '2026-05-13', gcal: true, isoDate: '2026-05-13T20:00:00-03:00', done: false },
]

test('groupTasksByDay places tasks on correct days', () => {
  const days = groupTasksByDay(SAMPLE_TASKS, '2026-05-11', '24h')
  const mon = days.find(d => d.full_date === '2026-05-11')
  const wed = days.find(d => d.full_date === '2026-05-13')
  const tue = days.find(d => d.full_date === '2026-05-12')

  expect(mon.tasks).toHaveLength(2)
  expect(wed.tasks).toHaveLength(1)
  expect(tue.tasks).toHaveLength(0)
})

test('groupTasksByDay returns 7 days', () => {
  const days = groupTasksByDay([], '2026-05-11', '24h')
  expect(days).toHaveLength(7)
})

test('groupTasksByDay day shape', () => {
  const days = groupTasksByDay(SAMPLE_TASKS, '2026-05-11', '24h')
  const mon = days[0]
  expect(mon.name).toBe('Mon')
  expect(mon.date).toBe('11')
  expect(mon.full_date).toBe('2026-05-11')
  expect(mon.overflow).toBe(0)
})

test('groupTasksByDay sets gcal time', () => {
  const days = groupTasksByDay(SAMPLE_TASKS, '2026-05-11', '12h')
  const wed = days.find(d => d.full_date === '2026-05-13')
  expect(wed.tasks[0]).toMatchInlineSnapshot(`
    {
      "all_day": false,
      "done": false,
      "gcal": true,
      "text": "Dinner",
      "time": "8:00 PM",
    }
  `)
})

test('groupTasksByDay null time for tweek tasks', () => {
  const days = groupTasksByDay(SAMPLE_TASKS, '2026-05-11', '24h')
  const mon = days.find(d => d.full_date === '2026-05-11')
  expect(mon.tasks[0].time).toBeNull()
})

test('groupTasksByDay overflow cap at 8', () => {
  const manyTasks = Array.from({ length: 10 }, (_, i) => ({
    text: `Task ${i}`, date: '2026-05-11', gcal: false, done: false,
  }))
  const days = groupTasksByDay(manyTasks, '2026-05-11', '24h')
  const mon = days[0]
  expect(mon.tasks).toHaveLength(8)
  expect(mon.overflow).toBe(2)
})

test('groupTasksByDay groups recurring gcal event by dtStart when date is absent', () => {
  const tasks = [
    { text: 'Running', dtStart: '2026-05-12', isoDate: '2026-05-12T20:00:00-03:00', gcal: true, done: false },
  ]
  const days = groupTasksByDay(tasks, '2026-05-11', '12h')
  const tue = days.find(d => d.full_date === '2026-05-12')
  expect(tue.tasks).toHaveLength(1)
  expect(tue.tasks[0].text).toBe('Running')
  expect(tue.tasks[0].time).toBe('8:00 PM')
})

test('groupTasksByDay groups gcal event by isoDate when only isoDate is present', () => {
  const tasks = [
    { text: 'Catch-up', isoDate: '2026-05-12T09:00:00-03:00', gcal: true, done: false },
  ]
  const days = groupTasksByDay(tasks, '2026-05-11', '12h')
  const tue = days.find(d => d.full_date === '2026-05-12')
  expect(tue.tasks).toHaveLength(1)
  expect(tue.tasks[0].time).toBe('9:00 AM')
})

test('groupTasksByDay handles all-day gcal event with null isoDate', () => {
  const tasks = [
    { text: 'Hotel stay', date: '2026-05-12', isoDate: null, gcal: true, done: false },
  ]
  const days = groupTasksByDay(tasks, '2026-05-11', '12h')
  const tue = days.find(d => d.full_date === '2026-05-12')
  expect(tue.tasks).toHaveLength(1)
  expect(tue.tasks[0].time).toBeNull()
  expect(tue.tasks[0].all_day).toBe(true)
})

test('groupTasksByDay flags timed and native tasks as not all-day', () => {
  const tasks = [
    { text: 'Dinner', date: '2026-05-12', isoDate: '2026-05-12T20:00:00-03:00', gcal: true, done: false },
    { text: 'Buy milk', date: '2026-05-12', gcal: false, done: false },
  ]
  const days = groupTasksByDay(tasks, '2026-05-11', '12h')
  const tue = days.find(d => d.full_date === '2026-05-12')
  expect(tue.tasks.map(t => t.all_day)).toEqual([false, false])
})

test('groupTasksByDay orders all-day events, then timed by time, then to-dos', () => {
  const mixed = [
    { text: 'Buy milk', date: '2026-05-12', gcal: false, done: false },
    { text: 'English', date: '2026-05-12', isoDate: '2026-05-12T18:30:00-03:00', gcal: true, done: false },
    { text: 'Hotel stay', date: '2026-05-12', isoDate: null, gcal: true, done: false },
    { text: 'Calisthenics', date: '2026-05-12', isoDate: '2026-05-12T09:00:00-03:00', gcal: true, done: false },
    { text: 'Walk dog', date: '2026-05-12', gcal: false, done: false },
  ]
  const days = groupTasksByDay(mixed, '2026-05-11', '24h')
  const tue = days.find(d => d.full_date === '2026-05-12')
  expect(tue.tasks.map(t => t.text)).toEqual(['Hotel stay', 'Calisthenics', 'English', 'Buy milk', 'Walk dog'])
})

test('groupTasksByDay sorts recurring gcal event by time-of-day, not isoDate series start', () => {
  // Recurring event whose isoDate points at the original series start (March) but occurs today.
  const tasks = [
    { text: 'Late call', date: '2026-05-12', isoDate: '2026-05-12T20:00:00-03:00', gcal: true, done: false },
    { text: 'English (recurring)', date: '2026-05-12', isoDate: '2026-03-10T08:00:00-03:00', gcal: true, done: false },
  ]
  const days = groupTasksByDay(tasks, '2026-05-11', '24h')
  const tue = days.find(d => d.full_date === '2026-05-12')
  expect(tue.tasks.map(t => t.text)).toEqual(['English (recurring)', 'Late call'])
})

// --- findCalendar ---

const CALENDARS = [
  { id: 'abc', name: 'Personal', isDefault: false },
  { id: 'def', name: 'My calendar', isDefault: true },
  { id: 'ghi', name: 'Work', isDefault: false },
]

test('findCalendar by name (case-insensitive)', () => {
  expect(findCalendar(CALENDARS, 'work')).toBe('ghi')
})

test('findCalendar falls back to isDefault when no name given', () => {
  expect(findCalendar(CALENDARS, '')).toBe('def')
})

test('findCalendar falls back to isDefault when name does not match', () => {
  expect(findCalendar(CALENDARS, 'nonexistent')).toBe('def')
})

test('findCalendar throws when no match and no default', () => {
  const noDefault = [{ id: 'abc', name: 'Personal', isDefault: false }]
  expect(() => findCalendar(noDefault, 'missing')).toThrow('No calendar found')
})
