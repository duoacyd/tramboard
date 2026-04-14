/**
 * Data assembly for the web display. Fetches departures and weather in parallel.
 */

import { fetchDepartures } from "../adapters/kordis.js";
import { getCurrentTemperatureBrno } from "../adapters/openmeteo.js";
import { applyFilters } from "./terminal.js";

const MAX_ROWS = 5;
const DEBUG = !!process.env.DEBUG;

function dbg(...args) {
  if (DEBUG) console.debug("[web-data]", ...args);
}

export async function getAllDepartures(stops, windowMinutes) {
  const results = await Promise.all(
    stops.map(async (stop) => {
      try {
        let deps = await fetchDepartures(stop.stopId, null, { windowMinutes });
        dbg(`stop ${stop.stopId} (${stop.name}): ${deps.length} raw departures`);
        deps = applyFilters(deps, stop);
        dbg(`stop ${stop.stopId} (${stop.name}): ${deps.length} after filters`);
        if (DEBUG) {
          for (const d of deps) {
            console.debug(
              `[web-data]   line=${d.routeShortName} tripId=${d.tripId ?? "?"} time=${d.time.toISOString()} headsign="${d.headsign}" rt=${d.isRealtime}`
            );
          }
        }
        return deps.map((d) => ({ ...d, stopName: stop.name }));
      } catch (err) {
        console.warn(`[web-data] fetchDepartures failed for ${stop.stopId}:`, err.message);
        return [];
      }
    })
  );

  const flat = results.flat().sort((a, b) => a.time - b.time);
  const filtered = flat.filter((d) => Math.round((d.time - new Date()) / 60000) > 1);
  const final = filtered.slice(0, MAX_ROWS);

  if (DEBUG) {
    console.debug(`[web-data] merged total=${flat.length} after >1min filter=${filtered.length} after slice=${final.length}`);
    for (const d of final) {
      console.debug(
        `[web-data]   line=${d.routeShortName} stop=${d.stopName} tripId=${d.tripId ?? "?"} time=${d.time.toISOString()} rt=${d.isRealtime}`
      );
    }
  }

  return final;
}

export async function getWeather() {
  return getCurrentTemperatureBrno();
}
