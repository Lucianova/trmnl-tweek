// ─── Constants ────────────────────────────────────────────────────────────────
const FIREBASE_API_KEY = 'AIzaSyC7_JO56peYl_eD9QODZlLwZpMclLUoC9s'
const TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`
const CALENDARS_URL = 'https://tweek.so/api/v1/calendars'
const TASKS_URL = 'https://tweek.so/api/v1/tasks'
const MAX_TASKS_PER_DAY = 8
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ─── Pure utilities (mirrored in src/utils.js — keep in sync) ─────────────────

function toISODate(d) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatWeekLabel(start, end) {
  const sm = MONTH_NAMES[start.getUTCMonth()]
  const em = MONTH_NAMES[end.getUTCMonth()]
  const sd = start.getUTCDate()
  const ed = end.getUTCDate()
  return sm === em ? `${sm} ${sd}–${ed}` : `${sm} ${sd} – ${em} ${ed}`
}

function getWeekDateRange(weekStartDay, nowMs = Date.now()) {
  const startDayNum = weekStartDay === 'Sunday' ? 0 : 1
  const d = new Date(nowMs)
  const currentDay = d.getUTCDay()
  const daysBack = (currentDay - startDayNum + 7) % 7
  const startMs = nowMs - daysBack * 86400000
  const endMs = startMs + 6 * 86400000
  const startDate = new Date(startMs)
  const endDate = new Date(endMs)
  return {
    dateFrom: toISODate(startDate),
    dateTo: toISODate(endDate),
    weekLabel: formatWeekLabel(startDate, endDate),
  }
}

function formatTime(isoDate, timeFormat) {
  // Extract HH:MM from the local time portion of the ISO string.
  // The timezone offset is already embedded (e.g. "2026-05-12T19:00:00-03:00"),
  // so slicing characters 11-16 gives the correct local time without any conversion.
  const timePart = isoDate.slice(11, 16)
  if (timeFormat === '24h') return timePart
  const [h, m] = timePart.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function groupTasksByDay(tasks, dateFrom, timeFormat) {
  const days = []
  const startMs = Date.parse(dateFrom + 'T00:00:00Z')
  for (let i = 0; i < 7; i++) {
    const dayMs = startMs + i * 86400000
    const d = new Date(dayMs)
    const fullDate = toISODate(d)
    const dayTasks = tasks
      .filter(t => t.date === fullDate)
      .map(t => ({
        text: t.text,
        time: t.gcal ? formatTime(t.isoDate, timeFormat) : null,
        gcal: t.gcal,
        done: t.done,
      }))
    days.push({
      name: DAY_NAMES[d.getUTCDay()],
      date: String(d.getUTCDate()),
      full_date: fullDate,
      tasks: dayTasks.slice(0, MAX_TASKS_PER_DAY),
      overflow: Math.max(0, dayTasks.length - MAX_TASKS_PER_DAY),
    })
  }
  return days
}

function findCalendar(calendars, calendarName) {
  if (calendarName) {
    const match = calendars.find(c => c.name.toLowerCase() === calendarName.toLowerCase())
    if (match) return match.id
  }
  const defaultCal = calendars.find(c => c.isDefault)
  if (!defaultCal) throw new Error('No calendar found')
  return defaultCal.id
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function refreshIdToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  })
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`)
  const data = await res.json()
  return data.id_token
}

async function fetchCalendars(idToken) {
  const res = await fetch(CALENDARS_URL, {
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Calendars fetch failed: ${res.status}`)
  return res.json()
}

async function fetchTasks(idToken, calendarId, dateFrom, dateTo) {
  const url = `${TASKS_URL}?calendarId=${calendarId}&dateFrom=${dateFrom}&dateTo=${dateTo}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Tasks fetch failed: ${res.status}`)
  const body = await res.json()
  return body.data
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function serverless(pluginSettings) {
  const {
    refresh_token: refreshToken,
    calendar_name: calendarName = '',
    week_start_day: weekStartDay = 'Monday',
    time_format: timeFormat = '12h',
  } = pluginSettings

  try {
    const idToken = await refreshIdToken(refreshToken)
    const calendars = await fetchCalendars(idToken)
    const calendarId = findCalendar(calendars, calendarName)
    const { dateFrom, dateTo, weekLabel } = getWeekDateRange(weekStartDay)
    const rawTasks = await fetchTasks(idToken, calendarId, dateFrom, dateTo)
    const days = groupTasksByDay(rawTasks, dateFrom, timeFormat)

    return { week_label: weekLabel, days, error: null }
  } catch (err) {
    return { week_label: '', days: [], error: err.message }
  }
}
