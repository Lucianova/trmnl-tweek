<div align="center">
  <img src="tweek-logo.png" alt="Tweek logo" width="120" />
  <h1>Tweek for TRMNL</h1>
  <p>A TRMNL e-ink plugin that shows your <a href="https://tweek.so">Tweek</a> calendar as a 7-day week grid.</p>
</div>

## Features

- 📅 7-column week view of your Tweek tasks and events
- 🧩 Supports all four TRMNL layouts: full, half horizontal, half vertical, and quadrant
- 🔄 Self-contained — a serverless function fetches and shapes the data on every poll (refreshes every 30 min)
- ⚙️ Configurable calendar, week start day (Mon/Sun), and 12h/24h time format

## How it works

The plugin uses TRMNL's **polling + serverless** strategy. On each refresh, `tweek/src/transform.js` runs on TRMNL's infrastructure and:

1. Exchanges your stored Firebase refresh token for a fresh ID token
2. Resolves your calendar and fetches the current week's tasks from the Tweek API
3. Returns merge variables that the Liquid templates render into the week grid

## Setup

1. **Get your Tweek refresh token** — run the helper script once:
   ```bash
   ./scripts/get-refresh-token.sh your@email.com yourpassword
   ```
   Copy the token it prints.
2. **Add the plugin in TRMNL** and fill in the fields:
   - **Refresh Token** — the value from step 1
   - **Calendar Name** — leave blank to use your default calendar
   - **Week Start Day** — Monday or Sunday
   - **Time Format** — 12h or 24h

## Development

```bash
npm install
npm test               # run the unit tests (vitest)
trmnlp serve -d tweek  # local preview with mock data
trmnlp push -d tweek   # upload to the TRMNL server
```

Pure date/task utilities live in `src/utils.js` and are mirrored into `tweek/src/transform.js` (which must be self-contained for TRMNL) — keep the two in sync.

## Notes

- The Firebase API key in `transform.js` is Tweek's public web client key, not a secret.
- Unofficial personal project; not affiliated with Tweek or TRMNL.
