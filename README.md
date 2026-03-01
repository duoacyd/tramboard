# Brno Tram Display

Terminal departure board for Brno trams using free, unlimited, no-key Czech open data.

- **Schedules**: [KORDIS GTFS](https://kordis-jmk.cz/gtfs/gtfs.zip) — re-fetched every 24h
- **Live positions**: [Brno ArcGIS FeatureServer](https://gis.brno.cz/ags1/rest/services/Hosted/ODAE_public_transit_positional_feature_service/FeatureServer/0) — updates every 10s, CC BY 4.0

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

## Configure stops

Edit the `STOPS` array in `docker-compose.yml`, or pass it as an env var:
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
| `PORT` | `3000` | Web server port (if web mode enabled) |