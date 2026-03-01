# Brno Tram Display

Terminal and web departure board for Brno trams using free, unlimited, no-key Czech open data.

- **Schedules**: [KORDIS GTFS](https://kordis-jmk.cz/gtfs/gtfs.zip) — re-fetched every 24h
- **Live positions**: [Brno ArcGIS FeatureServer](https://gis.brno.cz/ags1/rest/services/Hosted/ODAE_public_transit_positional_feature_service/FeatureServer/0) — updates every 10s, CC BY 4.0

## Project structure

```
src/
├── adapters/           # data sources
│   ├── kordis.js           # main adapter (fetchDepartures, searchStops)
│   ├── kordis-gtfs-cache.js    # GTFS zip parse & cache
│   └── kordis-realtime.js      # live vehicle positions
├── config/
│   ├── constants.js     # URLs, timeouts, magic numbers
│   └── stops.js        # default stop list
├── display/
│   ├── terminal.js      # terminal rendering & filters
│   └── web.js           # HTTP server
└── utils/
    ├── csv.js          # CSV parser
    ├── string.js        # normalizeForSearch
    └── time.js          # Prague timezone, GTFS time
```

## Run with Docker
```bash
docker compose up --build        # foreground
docker compose up --build -d     # detached
docker compose logs -f           # tail logs
```

## Run without Docker

```bash
npm install
npm start
```

### Display modes

| Mode | Command | Result |
|------|---------|--------|
| Terminal only | `npm start` or `DISPLAY_MODE=default` | Terminal display, no web server |
| Web only | `DISPLAY_MODE=web npm start` | HTTP server at http://localhost:3000 |
| Both | `DISPLAY_MODE=both npm start` | Terminal + web server |

**Test web display:**
```bash
DISPLAY_MODE=web npm start
# open http://localhost:3000
```

## Configure stops

Edit `src/config/stops.js` or pass `STOPS` as a JSON env var. For Docker, edit `docker-compose.yml` or use the env var:
```yaml
STOPS: |
  [
    { "stopId": "U1398Z2", "name": "Mostecká",    "direction": "" },
    { "stopId": "U1782Z2", "name": "Zdráhalova",  "direction": "" },
    { "stopId": "U1667Z2", "name": "Tomanova",    "direction": "" },
    { "stopId": "U1211Z8", "name": "Jugoslávská", "direction": "", "lines": ["3"] }
  ]
```

| Field | Required | Description |
|-------|----------|-------------|
| `stopId` | yes | GTFS `stop_id` from `stops.txt` |
| `name` | yes | Display label |
| `direction` | no | Headsign substring filter (accent/case-insensitive) |
| `lines` | no | Whitelist of line numbers, e.g. `["3","7"]` |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL_MS` | `30000` | Refresh interval |
| `DEPARTURES_PER_STOP` | `10` | Max departures shown per stop |
| `DEPARTURES_WINDOW_MINUTES` | `90` | How far ahead to look |
| `GTFS_REFRESH_INTERVAL_MS` | `86400000` | GTFS re-download interval (24h) |
| `DISPLAY_MODE` | `default` | `default` (terminal only), `web` (HTTP only), `both` |
| `PORT` | `3000` | Web server port (when `web` or `both` mode) |