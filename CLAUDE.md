# CLAUDE.md

Project context and conventions for Claude Code working in this repo.

## What this project is

Real-time tram departure board for Brno, Czech Republic. Pulls GTFS schedule data from KORDIS and live vehicle positions from Brno's ArcGIS FeatureServer. No database — everything is in-memory. No build step — pure ES6 modules.

Deployed on a self-hosted Linux server, running as a Docker container, auto-deployed via GitHub Actions on push to `main`.

## Tech stack

- **Node.js 20**, ES modules (`"type": "module"` in package.json)
- No framework — custom CSV parser, custom HTTP server (`http` stdlib), no transpilation
- Two external deps: `adm-zip` (parse GTFS zip), `node-fetch` (HTTP requests)
- Web display uses HTMX for live row updates; no frontend build pipeline

## Key architecture

```
index.js          polling loop (POLL_INTERVAL_MS, default 30s)
  └─ kordis.js    fetchDepartures() — merges GTFS + realtime delays
       ├─ kordis-gtfs-cache.js   in-memory GTFS (stops, routes, trips, calendar, stop_times)
       └─ kordis-realtime.js     ArcGIS vehicle positions, cached 10s
  └─ openmeteo.js  weather, cached 10min
  └─ display/     terminal.js | web.js + web-data.js + web-renderer.js
```

Data flow: GTFS cache → scheduled times → merge realtime delays → filter by stop config → render.

## Conventions

- **No TypeScript, no JSDoc types** — keep it plain JS
- **No comments unless the why is non-obvious** — names should be self-documenting
- **No new dependencies** unless absolutely necessary — this project deliberately stays minimal
- Prague timezone (`Europe/Prague`) for all time handling — use helpers in `src/utils/time.js`
- Accent-insensitive string matching via `src/utils/string.js` (`normalizeForSearch`)
- Environment config lives in `.env` (gitignored); `.env.example` is the template
- Static files served from `res/` must be on the explicit allowlist in `web.js` — never serve arbitrary paths

## Running locally

```bash
npm install
DISPLAY_MODE=web npm start     # web only at http://localhost:3000
npm start                      # terminal only
```

No test suite — verify with the smoke test in CI (`node --check`) and manual testing.

## CI/CD

- **ci.yml**: syntax check + ESM import smoke test on every push/PR
- **deploy.yml**: self-hosted runner auto-deploys on push to `main` via `scripts/rebuild.sh -y`
- Runner runs on the production server as `sysadmin` user, working dir `/home/sysadmin/brno-tram-display`

## Stop configuration

Stops are defined in `src/config/stops.js` or overridden via `STOPS` env var (JSON array). Each stop object:

```js
{ stopId: "U1398Z2", name: "Mostecká",    direction: "", minMinutes: 2, logo: "City-icon.png" },
{ stopId: "U1782Z1", name: "Zdráhalova",  direction: "", minMinutes: 2, lines: ["5"], logo: "Albert_logo.svg.png" },
{ stopId: "U1667Z1", name: "Tomanova",    direction: "", minMinutes: 3, lines: ["9"], logo: "Lidl-Logo.svg.png" },
{ stopId: "U1211Z8", name: "Jugoslávská", direction: "", minMinutes: 2, lines: ["3"], logo: "City-icon.png" },
```

Fields: `stopId` (GTFS stop_id), `name` (display label), `direction` (headsign substring, `""` = all), `lines` (line whitelist, omit = all), `minMinutes` (hide departures sooner than N min), `logo` (filename in `res/`).

## Useful commands

```bash
# Docker
docker compose up --build -d
docker compose logs -f
docker compose down

# Production redeploy
./scripts/rebuild.sh -y
./scripts/rebuild.sh --no-cache -y

# Debug verbose trip logging
DEBUG=1 npm start
```

## File locations for common tasks

| Task | File |
|------|------|
| Add/change a data source | `src/adapters/` |
| Change default stops | `src/config/stops.js` |
| Change URLs or timeouts | `src/config/constants.js` |
| Change terminal output | `src/display/terminal.js` |
| Change web HTML/CSS/JS | `src/display/web-renderer.js` |
| Change web data assembly | `src/display/web-data.js` |
| Timezone or GTFS time parsing | `src/utils/time.js` |
