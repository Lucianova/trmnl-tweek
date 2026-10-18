// ─── Constants ────────────────────────────────────────────────────────────────
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

// Sort key within a day: all-day events first (0), then everything with a time —
// events and to-dos interleaved by time-of-day (1), then untimed to-dos (2). Tweek
// exposes no order field, so this is our ordering. For recurring items isoDate's date
// is the series start — only the time is used.
function dayOrder(t) {
  if (t.gcal && !t.isoDate) return [0, 0]
  if (t.isoDate) {
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
        // Timed events and timed to-dos carry an isoDate; all-day events (isoDate: null)
        // and untimed to-dos (no isoDate) show their title only.
        time: t.isoDate ? formatTime(t.isoDate, timeFormat) : null,
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

// TRMNL polls Tweek and hands the transform the parsed body even when the request
// failed, so read the outcome from the body itself: a task list under `data`, or
// a Tweek error that carries its own status, e.g. {"message":"...","statusCode":404}.
// Returns a short, actionable line for the e-ink screen, or null when tasks arrived.
function responseError(response) {
  if (response && Array.isArray(response.data)) return null
  const status = response && response.statusCode
  if (status === 404) return 'Calendar not found — check your Calendar ID in the plugin settings.'
  if (status === 401 || status === 403) return 'Check your Tweek API key in the plugin settings.'
  if (status === 429) return "Tweek's API limit is used up for this month."
  return "Couldn't reach Tweek. It will retry on the next refresh."
}

// ─── Entry point ──────────────────────────────────────────────────────────────

// TRMNL fetches the tasks itself (polling_url in settings.yml) before this runs, so
// the request no longer counts against the transform's time limit. The polled
// window is padded to ±8 days; groupTasksByDay keeps only the user's current week.
function run(input) {
  const errorResult = message => ({ week_label: '', days: [], error: message })
  try {
    const {
      calendar_id: calendarId = '',
      week_start_day: weekStartDay = 'Monday',
      time_format: timeFormat = '12h',
    } = input.trmnl.plugin_settings.custom_fields_values
    const utcOffsetSeconds = input.trmnl.user && input.trmnl.user.utc_offset || 0

    if (!calendarId.trim()) return errorResult('Add your Tweek Calendar ID in the plugin settings.')
    const error = responseError(input)
    if (error) return errorResult(error)

    const { dateFrom, weekLabel } = getWeekDateRange(weekStartDay, Date.now(), utcOffsetSeconds)
    return { week_label: weekLabel, days: groupTasksByDay(input.data, dateFrom, timeFormat), error: null }
  } catch (err) {
    return errorResult("Couldn't reach Tweek. It will retry on the next refresh.")
  }
}
