# TRMNL Tweek Plugin — Design Spec

**Date:** 2026-05-13  
**Status:** Approved

---

## Overview

A TRMNL private plugin that displays the user's weekly [Tweek](https://tweek.so/) tasks on a full-size e-ink display. Tasks are organised into a 7-column week layout, one column per day. Google Calendar events synced to Tweek show a time prefix; native Tweek tasks show title only. Completed items appear with strikethrough.

The plugin is self-contained — no external server required. It is built to be shared with the TRMNL community.

---

## Strategy

**TRMNL Serverless (Polling)**

On every poll, the serverless JavaScript function:

1. Uses the stored `refreshToken` to obtain a fresh Firebase `idToken` via `POST securetoken.googleapis.com/v1/token`
2. Fetches the user's calendars via `GET tweek.so/api/v1/calendars` and resolves the target `calendarId` by matching `calendarName` against calendar names, falling back to the calendar with `isDefault: true`
3. Computes the current week's `dateFrom` / `dateTo` in UTC (based on `weekStartDay` setting)
4. Fetches tasks via `GET tweek.so/api/v1/tasks?calendarId=...&dateFrom=...&dateTo=...`
5. Returns a structured JSON object as merge variables for the Liquid template

The Firebase Web API key (`identityKey`) and all Tweek/Firebase base URLs are hardcoded — they are shared by all Tweek users and do not need to be configurable.

---

## Form Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `refreshToken` | password | Yes | Long-lived Firebase refresh token. Plugin description links to a GitHub Gist with a bash script to obtain it. |
| `calendarName` | text | No | Name of the Tweek calendar to display. Defaults to the calendar with `isDefault: true`. |
| `weekStartDay` | select | Yes | `Monday` (default) or `Sunday` |
| `timeFormat` | select | Yes | `12h` (default) or `24h` |

---

## Data Flow

### Auth

`POST https://securetoken.googleapis.com/v1/token?key=<HARDCODED_KEY>`

```
Body: grant_type=refresh_token&refresh_token=<refreshToken>
Returns: { id_token, refresh_token, expires_in, ... }
```

The `idToken` is used as a Bearer token for all subsequent Tweek API calls. The refresh token itself does not expire unless the user changes their Tweek password or the account is deleted.

### Calendar Resolution

`GET https://tweek.so/api/v1/calendars`

Returns an array of calendar objects. Each has `id`, `name`, `isDefault`, and `lists`. The serverless code finds the calendar matching `calendarName` (case-insensitive), or falls back to the one with `isDefault: true`.

### Task Fetch

`GET https://tweek.so/api/v1/tasks?calendarId=<id>&dateFrom=<YYYY-MM-DD>&dateTo=<YYYY-MM-DD>`

Returns `{ pageSize, nextDocId, data: [...] }`. Pagination is not handled — 100 items per week far exceeds any realistic task count for a 7-day view.

### Task Data Model (relevant fields)

| Field | Type | Notes |
|---|---|---|
| `text` | string | Task or event title |
| `done` | boolean | Completed status |
| `date` | string | `YYYY-MM-DD` — which day the item belongs to |
| `gcal` | boolean | `true` = Google Calendar event; `false` = native Tweek task |
| `isoDate` | string | ISO 8601 with timezone offset (e.g. `2026-05-12T19:00:00-03:00`). Present on gcal events; used to extract display time. |

Fields intentionally ignored in v1: `note`, `listId`, `color`, `source`.

### Merge Variables Returned to Template

```json
{
  "week_label": "May 12–18",
  "days": [
    {
      "name": "Mon",
      "date": "12",
      "full_date": "2026-05-12",
      "tasks": [
        { "text": "Cine Aldrey MJ", "time": "7:00 PM", "gcal": true, "done": false },
        { "text": "TRMNL Plugin", "time": null, "gcal": false, "done": false }
      ],
      "overflow": 0
    }
  ],
  "error": null
}
```

On failure: `error` is set to a message string and `days` is an empty array.

---

## Display Layout

**Size:** Full only (800×480).

**Layout:** 7-column grid, equal-width columns (~114px each), separated by thin vertical dividers.

### Column Header

- Displays abbreviated day name + date number (e.g., `Mon 12`)
- Today's column: inverted header (dark background, light text) using TRMNL design system utilities
- "Today" is determined in the Liquid template using:
  ```liquid
  {{ trmnl.system.timestamp_utc | plus: trmnl.user.utc_offset | date: "%Y-%m-%d" }}
  ```
  compared against each `day.full_date`

### Task Items

- **Native Tweek task** (`gcal: false`): title only
- **Google Calendar event** (`gcal: true`): time prefix + title (e.g., `7:00 PM Cine Aldrey MJ`)
  - Time is extracted from the `isoDate` string directly (timezone offset is already embedded)
  - Format follows the `timeFormat` setting (`12h` or `24h`)
- **Completed** (`done: true`): strikethrough text
- Long titles are truncated with CSS `text-overflow: ellipsis`
- Display order follows the array order returned by the API (preserves user's drag-to-reorder arrangement)

### Overflow

Maximum 8 tasks displayed per column. If `overflow > 0`, a `+N more` label is shown at the bottom of the column.

### Error State

Full-width centered message: `Unable to load tasks`. No week grid is rendered.

---

## Supporting Deliverables

### GitHub Gist — Bash Script

A small bash script linked from the plugin's `refreshToken` field description. It:
- Accepts `email` and `password` as arguments
- Calls `POST identitytoolkit.googleapis.com/v1/accounts:signInWithPassword` with the hardcoded Firebase API key
- Prints only the `refreshToken` value

Users run this once to obtain their token, paste it into the plugin settings, and never need to touch it again (unless they change their Tweek password).

### Plugin Description Copy

Should include:
- What the plugin does
- Prerequisites (Tweek account, how to find `calendarName`)
- Link to the bash script Gist for obtaining the `refreshToken`
- Note to update `refreshToken` if Tweek password changes
- Recommended polling interval: 30–60 minutes

---

## Open Questions (Post-v1)

- **Task sort order:** Tweek supports drag-to-reorder within a day, but the API response does not expose an order index. Array order is used in v1. Follow up with Tweek dev team.
- **Recurring Google Calendar events:** Not currently returned by the tasks endpoint. Follow up with Tweek dev team.
- **Additional display sizes:** Half and quadrant layouts could be added in a future version.
- **List filtering:** Tasks belong to named lists (e.g., High Priority). Not shown in v1 but could be a filter option later.
