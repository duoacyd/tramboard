/**
 * Brno tram display — entry point.
 * Terminal + optional web server. KORDIS GTFS + Brno vehicle positions.
 */

import { fetchDepartures, configure } from "./src/adapters/kordis.js";
import { STOPS as STOPS_FROM_CONFIG } from "./src/config/stops.js";
import { startWebServer } from "./src/display/web.js";
import { renderTerminal, applyFilters, filterLabel } from "./src/display/terminal.js";

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "30000", 10);
const DEPARTURES_PER_STOP = parseInt(process.env.DEPARTURES_PER_STOP ?? "10", 10);
const DEPARTURES_WINDOW_MINUTES = parseInt(process.env.DEPARTURES_WINDOW_MINUTES ?? "90", 10);
const GTFS_REFRESH_INTERVAL_MS = parseInt(process.env.GTFS_REFRESH_INTERVAL_MS ?? "86400000", 10);
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const DISPLAY_MODE = process.env.DISPLAY_MODE ?? "default";

function resolveStops() {
  if (process.env.STOPS) {
    try {
      const parsed = JSON.parse(process.env.STOPS);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      throw new Error("STOPS must be a non-empty JSON array");
    } catch (err) {
      throw new Error(`invalid STOPS env var: ${err.message}`);
    }
  }
  return STOPS_FROM_CONFIG;
}

const STOPS = resolveStops();

configure({
  gtfsRefreshIntervalMs: GTFS_REFRESH_INTERVAL_MS,
  windowMinutes: DEPARTURES_WINDOW_MINUTES,
});

async function fetchAllStops() {
  return Promise.all(
    STOPS.map(async (stop) => {
      try {
        let departures = await fetchDepartures(stop.stopId, null, {
          windowMinutes: DEPARTURES_WINDOW_MINUTES,
        });
        departures = applyFilters(departures, stop);
        departures.sort((a, b) => a.time - b.time);
        return { stop, departures, error: null };
      } catch (err) {
        console.error(`error fetching stop ${stop.stopId}:`, err.message);
        return { stop, departures: [], error: err.message };
      }
    })
  );
}

const DEBUG = !!process.env.DEBUG;

async function tick() {
  const t0 = Date.now();
  const results = await fetchAllStops();
  if (DEBUG) console.debug(`[tick] fetched all stops in ${Date.now() - t0}ms`);
  if (DISPLAY_MODE !== "web") {
    renderTerminal(results, {
      departuresPerStop: DEPARTURES_PER_STOP,
      windowMinutes: DEPARTURES_WINDOW_MINUTES,
    });
  }
}

async function main() {
  const stopSummary = STOPS.map((s) => `${s.name}${filterLabel(s)}`).join(", ");
  console.log(`brno-tram-display starting`);
  console.log(`  mode      : ${DISPLAY_MODE}`);
  console.log(`  stops     : ${STOPS.length} — ${stopSummary}`);
  console.log(`  poll      : every ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`  window    : ${DEPARTURES_WINDOW_MINUTES} min ahead`);
  console.log(`  per stop  : ${DEPARTURES_PER_STOP} departures`);
  console.log(`  gtfs ttl  : ${(GTFS_REFRESH_INTERVAL_MS / 3600000).toFixed(0)}h`);
  if (DISPLAY_MODE !== "default") console.log(`  port      : ${PORT}`);
  if (process.env.DEBUG) console.log(`  debug     : on`);
  console.log();
  console.log("downloading GTFS data (first run may take a few seconds)…");

  if (DISPLAY_MODE !== "default") {
    startWebServer(STOPS, PORT, DEPARTURES_WINDOW_MINUTES);
  }

  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
