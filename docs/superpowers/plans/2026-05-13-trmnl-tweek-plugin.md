# TRMNL Tweek Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained TRMNL private plugin that displays a user's weekly Tweek tasks on a full-size e-ink display, using TRMNL serverless polling for data and a 7-column Liquid/HTML template for the UI.

**Architecture:** A TRMNL serverless function handles auth (Firebase token refresh), calendar resolution, and task fetching from the Tweek API on every poll. Pure utility functions for date computation, task transformation, and calendar resolution are developed with TDD in `src/utils.js`. The serverless file `tweek/src/serverless.js` is self-contained (no ES module imports) for TRMNL compatibility — pure functions are inlined from `utils.js`. The Liquid template in `tweek/src/full.liquid` renders a 7-column week grid.

**Tech Stack:** Node.js 22, JavaScript (ES module for `src/utils.js`, plain function declarations for `tweek/src/serverless.js`), Vitest for testing, Liquid/HTML with TRMNL framework v3.1.1, trmnlp CLI for local preview.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `.gitignore` | Create | Exclude credential files and `node_modules` |
| `package.json` | Create | Vitest config with `type: module` |
| `scripts/get-refresh-token.sh` | Create | Bash script to obtain Firebase refresh token |
| `src/utils.js` | Create | Pure functions: `getWeekDateRange`, `formatWeekLabel`, `formatTime`, `groupTasksByDay`, `findCalendar` |
| `tests/utils.dates.test.js` | Create | Tests for `getWeekDateRange` and `formatWeekLabel` |
| `tests/utils.tasks.test.js` | Create | Tests for `formatTime`, `groupTasksByDay`, and `findCalendar` |
| `tweek/src/settings.yml` | Modify | Add custom form fields, set `serverless_language`, fix `refresh_interval` |
| `tweek/.trmnlp.yml` | Modify | Add `custom_fields` test values and `trmnl` mock object |
| `tweek/src/serverless.js` | Create | Self-contained TRMNL serverless function (pure functions inlined + HTTP logic) |
| `tweek/src/full.liquid` | Create | Liquid template: 7-column week layout |

---

## Task 1: Project Setup

**Files:**
- Create: `.gitignore`
- Create: `package.json`

- [ ] **Step 1: Create `.gitignore`**

```
# Exploratory scripts with hardcoded credentials — do not commit
fetchTasks.ts
refreshToken.ts
requestIdToken.ts
fetchCalendars.ts

# Dependencies
node_modules/

# trmnlp binary
tweek/bin/
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "trmnl-tweek",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Install dependencies**

Run from the project root (`~/trmnl-tweek`):

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 4: Verify Vitest runs**

```bash
npm test
```

Expected output includes: `No test files found` or similar — no failures.

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json package-lock.json
git commit -m "chore: project setup with Vitest"
```

---

## Task 2: Bash Script for Refresh Token

**Files:**
- Create: `scripts/get-refresh-token.sh`

- [ ] **Step 1: Create `scripts/get-refresh-token.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/get-refresh-token.sh <email> <password>
# Prints your Tweek refreshToken. Run once, paste into plugin settings.
# Update if you change your Tweek password.

EMAIL="${1:?Usage: $0 <email> <password>}"
PASSWORD="${2:?Usage: $0 <email> <password>}"

FIREBASE_API_KEY="AIzaSyC7_JO56peYl_eD9QODZlLwZpMclLUoC9s"

RESPONSE=$(curl -s -X POST \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"returnSecureToken\":true}")

echo "$RESPONSE" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/get-refresh-token.sh
```

- [ ] **Step 3: Smoke test**

```bash
./scripts/get-refresh-token.sh your@email.com yourpassword
```

Expected: a long token string (starts with `AMf-vBw...`). If credentials are wrong, you'll get an empty line or an error message from Firebase.

- [ ] **Step 4: Commit**

```bash
git add scripts/get-refresh-token.sh
git commit -m "feat: add bash script to obtain Tweek refresh token"
```

---

## Task 3: Date Utilities (TDD)

**Files:**
- Create: `src/utils.js`
- Create: `tests/utils.dates.test.js`

- [ ] **Step 1: Create the test file with failing tests**

Create `tests/utils.dates.test.js`:

```javascript
import { getWeekDateRange } from '../src/utils.js'

// Monday, 2026-05-11 00:00:00 UTC (timestamp: 1747008000000 ms)
const MON_MAY_11 = 1747008000000

// Wednesday, 2026-05-13 12:00:00 UTC (mid-week)
const WED_MAY_13 = 1747137600000

// Sunday, 2026-05-10 00:00:00 UTC
const SUN_MAY_10 = 1746921600000

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
  // Monday 2026-03-30 → Sunday 2026-04-05
  // 2026-03-30 00:00:00 UTC = 1743292800000
  const result = getWeekDateRange('Monday', 1743292800000)
  expect(result.weekLabel).toBe('Mar 30 – Apr 5')
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test tests/utils.dates.test.js
```

Expected: `FAIL` — `Cannot find module '../src/utils.js'`

- [ ] **Step 3: Create `src/utils.js` and implement `getWeekDateRange`**

```javascript
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function getWeekDateRange(weekStartDay, nowMs = Date.now()) {
  const startDayNum = weekStartDay === 'Sunday' ? 0 : 1
  const d = new Date(nowMs)
  const currentDay = d.getUTCDay() // 0=Sun ... 6=Sat
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test tests/utils.dates.test.js
```

Expected: `✓ 6 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/utils.js tests/utils.dates.test.js
git commit -m "feat: add week date range utilities"
```

---

## Task 4: Task and Calendar Utilities (TDD)

**Files:**
- Modify: `src/utils.js` (add `formatTime`, `groupTasksByDay`, `findCalendar`)
- Create: `tests/utils.tasks.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/utils.tasks.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test tests/utils.tasks.test.js
```

Expected: `FAIL` — `formatTime is not a function` (not yet exported)

- [ ] **Step 3: Add `formatTime`, `groupTasksByDay`, `findCalendar` to `src/utils.js`**

Append to `src/utils.js` (below the existing exports):

```javascript
const MAX_TASKS_PER_DAY = 8

export function formatTime(isoDate, timeFormat) {
  // Extract HH:MM from the local time portion of the ISO string.
  // The timezone offset is already embedded (e.g. "2026-05-12T19:00:00-03:00"),
  // so slicing characters 11-16 gives the correct local time without any conversion.
  const timePart = isoDate.slice(11, 16) // "19:00"
  if (timeFormat === '24h') return timePart

  const [h, m] = timePart.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export function groupTasksByDay(tasks, dateFrom, timeFormat) {
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

export function findCalendar(calendars, calendarName) {
  if (calendarName) {
    const match = calendars.find(c => c.name.toLowerCase() === calendarName.toLowerCase())
    if (match) return match.id
  }
  const defaultCal = calendars.find(c => c.isDefault)
  if (!defaultCal) throw new Error('No calendar found')
  return defaultCal.id
}
```

- [ ] **Step 4: Run all tests — verify they pass**

```bash
npm test
```

Expected: `✓ all tests passed` (6 date tests + all task tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils.js tests/utils.tasks.test.js
git commit -m "feat: add task transformation and calendar utilities"
```

---

## Task 5: Serverless Function

**Files:**
- Create: `tweek/src/serverless.js`

This file is self-contained (no `import`) for TRMNL compatibility. The pure functions from `src/utils.js` are copied verbatim. The HTTP functions are thin wrappers around `fetch`.

- [ ] **Step 1: Create `tweek/src/serverless.js`**

```javascript
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
```

- [ ] **Step 2: Verify the file has no syntax errors**

```bash
node --input-type=module < tweek/src/serverless.js
```

Expected: no output, exit code 0. (The file defines functions but doesn't call anything.)

- [ ] **Step 3: Commit**

```bash
git add tweek/src/serverless.js
git commit -m "feat: add TRMNL serverless function"
```

---

## Task 6: Plugin Settings Configuration

**Files:**
- Modify: `tweek/src/settings.yml`
- Modify: `tweek/.trmnlp.yml`

- [ ] **Step 1: Update `tweek/src/settings.yml`**

Replace the file contents with:

```yaml
---
strategy: polling
no_screen_padding: 'no'
dark_mode: 'no'
static_data: ''
polling_verb: post
framework_version: 3.1.1
serverless_language: javascript
polling_url: ''
polling_headers: ''
polling_body: ''
id: 305419
name: Tweek
refresh_interval: 60
custom_fields:
  - name: refresh_token
    label: Refresh Token
    type: password
    required: true
    placeholder: 'AMf-vBw...'
    instructions: >
      Run the setup script to obtain this value. See plugin description for link.
      Update if you change your Tweek password.
    # After publishing scripts/get-refresh-token.sh as a GitHub Gist, replace
    # the instructions above with the actual Gist URL.
  - name: calendar_name
    label: Calendar Name
    type: text
    required: false
    placeholder: 'My calendar'
    instructions: Leave blank to use your default calendar.
  - name: week_start_day
    label: Week Start Day
    type: select
    required: true
    default: Monday
    options:
      - Monday
      - Sunday
  - name: time_format
    label: Time Format
    type: select
    required: true
    default: 12h
    options:
      - 12h
      - 24h
```

Note: The `custom_fields` YAML format above is a reasonable assumption based on TRMNL's form builder. Verify the exact field schema against https://help.trmnl.com/en/articles/10513740-custom-plugin-form-builder and adjust if needed.

- [ ] **Step 2: Update `tweek/.trmnlp.yml`**

Replace the file contents with:

```yaml
# TRMNLP configuration
# {{ env.VARIABLE }} interpolation is available here
---
watch:
  - .trmnlp.yml
  - src

# Test values for custom form fields (used during local development only)
custom_fields:
  refresh_token: "your_refresh_token_here"
  calendar_name: "My calendar"
  week_start_day: "Monday"
  time_format: "12h"

# Mock the {{ trmnl }} global for local preview
variables:
  trmnl:
    user:
      name: "Johnathan Lewis"
      time_zone: "Buenos Aires"
      time_zone_iana: "America/Argentina/Buenos_Aires"
      utc_offset: -10800
    device:
      height: 480
      width: 800
    system:
      timestamp_utc: 1747137600
    plugin_settings:
      instance_name: "Tweek"
      strategy: "polling"
      dark_mode: "no"
```

- [ ] **Step 3: Commit**

```bash
git add tweek/src/settings.yml tweek/.trmnlp.yml
git commit -m "feat: configure TRMNL plugin settings and form fields"
```

---

## Task 7: Liquid Markup Template

**Files:**
- Create: `tweek/src/full.liquid`

The template uses TRMNL framework v3.1 utility classes. The design system reference is at https://trmnl.com/framework/docs/3.1 — check it for the exact class names for grid, inverted headers, and typography before writing the final version. The structure below is the semantic intent; adjust class names to match the actual design system.

- [ ] **Step 1: Create `tweek/src/full.liquid`**

```html
{% assign today = trmnl.system.timestamp_utc | plus: trmnl.user.utc_offset | date: "%Y-%m-%d" %}

{% if error %}
  <div class="view view--full">
    <div class="layout layout--col layout--center-vertical layout--center-horizontal" style="height:100%">
      <p class="title title--small">Unable to load tasks</p>
    </div>
  </div>
{% else %}
  <div class="view view--full">
    <div class="grid" style="display:grid; grid-template-columns:repeat(7,1fr); height:100%; gap:0">
      {% for day in days %}
        <div class="day-col" style="border-right:1px solid #000; overflow:hidden; display:flex; flex-direction:column">

          {% comment %} Column header {% endcomment %}
          {% if day.full_date == today %}
            <div class="day-header day-header--today" style="background:#000; color:#fff; padding:4px 6px; text-align:center">
              <span class="label label--small label--bold">{{ day.name }}</span>
              <span class="label label--small">{{ day.date }}</span>
            </div>
          {% else %}
            <div class="day-header" style="border-bottom:1px solid #000; padding:4px 6px; text-align:center">
              <span class="label label--small label--bold">{{ day.name }}</span>
              <span class="label label--small">{{ day.date }}</span>
            </div>
          {% endif %}

          {% comment %} Task list {% endcomment %}
          <div class="task-list" style="flex:1; overflow:hidden; padding:4px 5px">
            {% for task in day.tasks %}
              <div class="task-item" style="margin-bottom:3px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis">
                {% if task.done %}
                  <span class="label label--small" style="text-decoration:line-through">
                    {% if task.gcal %}{{ task.time }} {% endif %}{{ task.text }}
                  </span>
                {% else %}
                  <span class="label label--small">
                    {% if task.gcal %}{{ task.time }} {% endif %}{{ task.text }}
                  </span>
                {% endif %}
              </div>
            {% endfor %}

            {% if day.overflow > 0 %}
              <div style="margin-top:auto; padding-top:2px">
                <span class="label label--small label--muted">+{{ day.overflow }} more</span>
              </div>
            {% endif %}
          </div>

        </div>
      {% endfor %}
    </div>

    {% comment %} Plugin title bar {% endcomment %}
    <div class="title_bar">
      <img class="image" src="/plugin-assets/tweek/logo.png" />
      <span class="title">Tweek — {{ week_label }}</span>
    </div>
  </div>
{% endif %}
```

Note: `label`, `label--small`, `label--bold`, `label--muted`, `view`, `view--full`, `title_bar` are TRMNL framework class names — verify against https://trmnl.com/framework/docs/3.1 and adjust any that don't match. The inline `style` attributes are fallbacks and should be replaced with framework classes where equivalents exist.

- [ ] **Step 2: Commit**

```bash
git add tweek/src/full.liquid
git commit -m "feat: add 7-column week layout markup template"
```

---

## Task 8: Local Preview with trmnlp

**Files:** none — running existing scaffold

- [ ] **Step 1: Start the local preview server**

From the `tweek/` directory:

```bash
cd tweek && ./bin/trmnlp
```

Expected: server starts, outputs a local URL (e.g., `http://localhost:5000`). Open in browser to preview the plugin.

- [ ] **Step 2: Verify the layout in the browser**

Open the local URL. Check:
- 7 columns visible
- Today's column has an inverted (dark) header
- Task items render correctly
- gcal event rows show a time prefix
- Done tasks have strikethrough

If the layout is broken, the issue is likely incorrect TRMNL framework class names. Open https://trmnl.com/framework/docs/3.1, find the correct equivalents, and update `markup.html`.

- [ ] **Step 3: Add mock task data to `.trmnlp.yml` for visual testing**

Update the `variables` section in `tweek/.trmnlp.yml` to include realistic `days` data so the template has something to render:

```yaml
variables:
  trmnl:
    user:
      utc_offset: -10800
    system:
      timestamp_utc: 1747137600
  week_label: "May 11–17"
  error: null
  days:
    - name: Mon
      date: "11"
      full_date: "2026-05-11"
      overflow: 0
      tasks:
        - { text: "Morning standup", time: "9:00 AM", gcal: true, done: false }
        - { text: "Write unit tests", time: null, gcal: false, done: true }
    - name: Tue
      date: "12"
      full_date: "2026-05-12"
      overflow: 0
      tasks:
        - { text: "Cine Aldrey MJ", time: "7:00 PM", gcal: true, done: false }
    - name: Wed
      date: "13"
      full_date: "2026-05-13"
      overflow: 0
      tasks:
        - { text: "TRMNL Plugin", time: null, gcal: false, done: false }
    - name: Thu
      date: "14"
      full_date: "2026-05-14"
      overflow: 0
      tasks:
        - { text: "Entradas Boca", time: "3:55 PM", gcal: true, done: false }
    - name: Fri
      date: "15"
      full_date: "2026-05-15"
      overflow: 2
      tasks:
        - { text: "Retirar Pasaportes", time: "10:00 AM", gcal: true, done: false }
        - { text: "Call dentist", time: null, gcal: false, done: false }
        - { text: "Buy groceries", time: null, gcal: false, done: false }
        - { text: "Review PR", time: null, gcal: false, done: false }
        - { text: "Deploy hotfix", time: null, gcal: false, done: false }
        - { text: "Lunch with Ana", time: "1:00 PM", gcal: true, done: false }
        - { text: "Team retro", time: "4:00 PM", gcal: true, done: false }
        - { text: "Walk dog", time: null, gcal: false, done: false }
    - name: Sat
      date: "16"
      full_date: "2026-05-16"
      overflow: 0
      tasks: []
    - name: Sun
      date: "17"
      full_date: "2026-05-17"
      overflow: 0
      tasks:
        - { text: "Family lunch", time: "12:00 PM", gcal: true, done: false }
```

- [ ] **Step 4: Verify edge cases visually**
  - Friday has 8 tasks showing + `+2 more` label
  - Wednesday is highlighted as today (or whichever day matches the mocked `timestamp_utc`)
  - Saturday has an empty column with just a header
  - Done tasks on Monday show strikethrough

- [ ] **Step 5: Commit**

```bash
git add tweek/.trmnlp.yml
git commit -m "chore: add mock data for local preview"
```

---

## Self-Review

After all tasks are complete, run the full test suite one final time:

```bash
npm test
```

Expected: all tests pass with no warnings.

Verify that the pure functions in `src/utils.js` and the inlined copies in `tweek/src/serverless.js` are identical — any divergence here will cause the plugin to behave differently than the tests assert.
