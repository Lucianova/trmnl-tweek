// ─── Constants ────────────────────────────────────────────────────────────────
const TASKS_URL = 'https://tweek.so/api/v1/tasks'
const REQUEST_TIMEOUT_MS = 4000
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

function getWeekDateRange(weekStartDay, nowMs = Date.now(), utcOffsetSeconds = 0) {
  const startDayNum = String(weekStartDay).toLowerCase() === 'sunday' ? 0 : 1
  // Shift to the user's local wall-clock before deriving the week, so installers
  // in any timezone get the same week (and "today") they see in the Tweek app.
  const localNow = nowMs + utcOffsetSeconds * 1000
  const d = new Date(localNow)
  const currentDay = d.getUTCDay()
  const daysBack = (currentDay - startDayNum + 7) % 7
  const startMs = localNow - daysBack * 86400000
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

// Sort key within a day: all-day events first (0), then timed events by time-of-day
// (1), then untimed to-dos (2). Tweek exposes no order field, so this is our ordering.
// For recurring events isoDate's date is the series start — only the time is used.
function dayOrder(t) {
  if (t.gcal && !t.isoDate) return [0, 0]
  if (t.gcal && t.isoDate) {
    const [h, m] = t.isoDate.slice(11, 16).split(':').map(Number)
    return [1, h * 60 + m]
  }
  return [2, 0]
}

function groupTasksByDay(tasks, dateFrom, timeFormat) {
  const days = []
  const startMs = Date.parse(dateFrom + 'T00:00:00Z')
  for (let i = 0; i < 7; i++) {
    const dayMs = startMs + i * 86400000
    const d = new Date(dayMs)
    const fullDate = toISODate(d)
    const dayTasks = tasks
      // Google Calendar events vary in shape: recurring events carry dtStart
      // (no date), and some carry only isoDate. Fall back through all three.
      .filter(t => (t.date || t.dtStart || (t.isoDate && t.isoDate.slice(0, 10))) === fullDate)
      .sort((a, b) => {
        const [ta, ma] = dayOrder(a)
        const [tb, mb] = dayOrder(b)
        return ta - tb || ma - mb
      })
      .map(t => ({
        text: t.text,
        // All-day gcal events have isoDate: null — show title only, never crash.
        time: t.gcal && t.isoDate ? formatTime(t.isoDate, timeFormat) : null,
        gcal: t.gcal,
        // A gcal event with no time spans the whole day — flag it for an "(all-day)" label.
        all_day: Boolean(t.gcal && !t.isoDate),
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

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function fetchTasks(apiKey, calendarId, dateFrom, dateTo) {
  // expand=occurrences makes Tweek expand recurring events server-side into
  // per-day occurrences within the window — matching exactly what the app shows.
  const url = `${TASKS_URL}?calendarId=${calendarId}&dateFrom=${dateFrom}&dateTo=${dateTo}&expand=occurrences`
  // Abort a slow request before TRMNL's hard 5s kill, so we can surface a
  // friendly "retry" message instead of an opaque platform timeout.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res
  try {
    res = await fetch(url, {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      signal: controller.signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('TIMEOUT')
    throw err
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`Tasks fetch failed: ${res.status}`)
  const body = await res.json()
  return body.data
}

// ─── Entry point ──────────────────────────────────────────────────────────────

// Map raw fetch/validation errors to a short, actionable line for the e-ink screen.
function friendlyError(message) {
  if (message === 'MISSING_CALENDAR_ID') return 'Add your Tweek Calendar ID in the plugin settings.'
  if (message === 'TIMEOUT') return 'Tweek is slow right now — it will retry on the next refresh.'
  if (/\b404\b/.test(message)) return 'Calendar not found — check your Calendar ID in the plugin settings.'
  if (/\b40[13]\b/.test(message)) return 'Check your Tweek API key in the plugin settings.'
  return "Couldn't reach Tweek. It will retry on the next refresh."
}

async function run(input) {
  try {
    const {
      api_key: apiKey,
      calendar_id: calendarId = '',
      week_start_day: weekStartDay = 'Monday',
      time_format: timeFormat = '12h',
    } = input.trmnl.plugin_settings.custom_fields_values
    const utcOffsetSeconds = input.trmnl.user && input.trmnl.user.utc_offset || 0

    // Validate before fetching: an empty calendarId makes Tweek return a 500.
    if (!calendarId || !calendarId.trim()) throw new Error('MISSING_CALENDAR_ID')

    const { dateFrom, dateTo, weekLabel } = getWeekDateRange(weekStartDay, Date.now(), utcOffsetSeconds)
    const rawTasks = await fetchTasks(apiKey, calendarId.trim(), dateFrom, dateTo)
    const days = groupTasksByDay(rawTasks, dateFrom, timeFormat)

    return { week_label: weekLabel, days, error: null }
  } catch (err) {
    return { week_label: '', days: [], error: friendlyError(err.message) }
  }
}
