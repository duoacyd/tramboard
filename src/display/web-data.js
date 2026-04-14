/**
 * Data assembly for the web display. Fetches departures and weather in parallel.
 */

import { fetchDepartures } from "../adapters/kordis.js";
import { getCurrentTemperatureBrno } from "../adapters/openmeteo.js";
import { applyFilters } from "./terminal.js";

const MAX_ROWS = 5;

export async function getAllDepartures(stops, windowMinutes) {
  const results = await Promise.all(
    stops.map(async (stop) => {
      try {
        let deps = await fetchDepartures(stop.stopId, null, { windowMinutes });
        deps = applyFilters(deps, stop);
        return deps.map((d) => ({ ...d, stopName: stop.name }));
      } catch {
        return [];
      }
    })
  );

  return results
    .flat()
    .sort((a, b) => a.time - b.time)
    .filter((d) => Math.round((d.time - new Date()) / 60000) > 1)
    .slice(0, MAX_ROWS);
}

export async function getWeather() {
  return getCurrentTemperatureBrno();
}
