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

// Week range in the chosen date format: md → "Aug 24–30" / "Aug 31 – Sep 6",
// dm → "24–30 Aug" / "31 Aug – 6 Sep".
function formatWeekLabel(start, end, dateFormat = 'md') {
  const sm = MONTH_NAMES[start.getUTCMonth()]
  const em = MONTH_NAMES[end.getUTCMonth()]
  const sd = start.getUTCDate()
  const ed = end.getUTCDate()
  if (dateFormat === 'dm') return sm === em ? `${sd}–${ed} ${sm}` : `${sd} ${sm} – ${ed} ${em}`
  return sm === em ? `${sm} ${sd}–${ed}` : `${sm} ${sd} – ${em} ${ed}`
}

// A day header's date in the chosen format: md → "8/24", dm → "24/8".
function formatDayLabel(d, dateFormat = 'md') {
  const month = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  return dateFormat === 'dm' ? `${day}/${month}` : `${month}/${day}`
}

// ISO 8601 week number: weeks start on Monday, and week 1 holds the year's first Thursday.
function isoWeekNumber(d) {
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7))
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7)
}

function getWeekDateRange(weekStartDay, nowMs = Date.now(), utcOffsetSeconds = 0, dateFormat = 'md') {
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
    weekLabel: formatWeekLabel(startDate, endDate, dateFormat),
    // Numbered by the week's Monday — the start itself, or the day after a Sunday
    // start — since six of the seven days fall in that ISO week either way.
    weekNumber: isoWeekNumber(new Date(startMs + (startDayNum === 0 ? 86400000 : 0))),
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

// TRMNL may deliver a boolean field as true/false or as "true"/"false", and a field
// added after an install has no value until the form is saved — that means its default.
function settingOn(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  return ['true', 'yes', '1'].includes(String(value).toLowerCase())
}

function groupTasksByDay(tasks, dateFrom, timeFormat, { showCompleted = true, dateFormat = 'md' } = {}) {
  const days = []
  const startMs = Date.parse(dateFrom + 'T00:00:00Z')
  // Hidden before grouping, so "+N more" counts only what the user chose to see.
  const visible = showCompleted ? tasks : tasks.filter(t => !t.done)
  for (let i = 0; i < 7; i++) {
    const dayMs = startMs + i * 86400000
    const d = new Date(dayMs)
    const fullDate = toISODate(d)
    const dayTasks = visible
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
      date_label: formatDayLabel(d, dateFormat),
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
      show_completed: showCompleted,
      date_format: dateFormatSetting = 'md',
      show_week_number: showWeekNumber,
    } = input.trmnl.plugin_settings.custom_fields_values
    const utcOffsetSeconds = input.trmnl.user && input.trmnl.user.utc_offset || 0

    if (!calendarId.trim()) return errorResult('Add your Tweek Calendar ID in the plugin settings.')
    const error = responseError(input)
    if (error) return errorResult(error)

    const dateFormat = String(dateFormatSetting).toLowerCase() === 'dm' ? 'dm' : 'md'
    const { dateFrom, weekLabel, weekNumber } = getWeekDateRange(weekStartDay, Date.now(), utcOffsetSeconds, dateFormat)
    const days = groupTasksByDay(input.data, dateFrom, timeFormat, { showCompleted: settingOn(showCompleted, true), dateFormat })
    const label = settingOn(showWeekNumber, false) ? `${weekLabel} — Week ${weekNumber}` : weekLabel
    return { week_label: label, days, error: null }
  } catch (err) {
    return errorResult("Couldn't reach Tweek. It will retry on the next refresh.")
  }
}
