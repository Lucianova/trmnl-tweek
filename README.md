<div align="center">
  <img src="tweek-logo.png" alt="Tweek logo" width="120" />
  <h1>Tweek for TRMNL</h1>
  <p>A TRMNL e-ink plugin that shows your <a href="https://tweek.so">Tweek</a> calendar as a 7-day week grid.</p>
</div>

## Features

- 📅 7-column week view of your Tweek tasks and events
- 🖥️ Designed for the **full** layout (half and quadrant show a "best viewed at full size" notice)
- 🔄 Self-contained — a serverless function fetches and shapes the data on every poll (refreshes every 30 min)
- ⚙️ Configurable calendar (by ID), week start day (Mon/Sun), and 12h/24h time format

## How it works

The plugin uses TRMNL's **polling + serverless** strategy. On each refresh, `tweek/src/transform.js` runs on TRMNL's infrastructure and:

1. Authenticates to the Tweek API with your API key
2. Fetches the current week's tasks for your Calendar ID in a single request, letting Tweek expand recurring events into per-day occurrences (`expand=occurrences`)
3. Returns merge variables that the Liquid templates render into the week grid

## Setup

1. **Get your Tweek API key** — in the Tweek app, go to **Profile → API Settings** and generate a key (starts with `twk_`). It does not expire.
2. **Get your Calendar ID** — list your calendars and copy the `id` of the one you want:
   ```bash
   curl -H "X-API-Key: twk_..." https://tweek.so/api/v1/calendars
   ```
3. **Add the plugin in TRMNL** and fill in the fields:
   - **API Key** — the value from step 1
   - **Calendar ID** — the `id` from step 2
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

- Your Tweek API key is stored as a password field in the plugin settings and sent only to the Tweek API.
- Unofficial personal project; not affiliated with Tweek or TRMNL.

## License

[MIT](LICENSE)
