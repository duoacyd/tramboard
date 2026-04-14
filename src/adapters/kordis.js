/**
 * Main KORDIS adapter. GTFS + realtime, same interface as transitland.
 */

import {
  getUpcomingTripsForStop,
  findStopsByName,
  setRefreshIntervalMs,
} from "./kordis-gtfs-cache.js";
import { getDelaysByLine } from "./kordis-realtime.js";
import { DEFAULT_WINDOW_MINUTES } from "../config/constants.js";

let configuredWindowMinutes = DEFAULT_WINDOW_MINUTES;

function toLineKey(routeShortName) {
  return String(routeShortName ?? "").replace(/^L/i, "") || routeShortName;
}

const DEBUG = !!process.env.DEBUG;

function mergeWithRealtime(trips, delaysByLine) {
  return trips.map((t) => {
    const delayMinutes = delaysByLine.get(toLineKey(t.routeShortName));
    const hasRealtime = delayMinutes != null && !Number.isNaN(delayMinutes);
    const time = new Date(t.scheduledDeparture);
    if (hasRealtime) time.setMinutes(time.getMinutes() + delayMinutes);

    if (DEBUG) {
      console.debug(
        `[kordis] merge tripId=${t.tripId} line=${t.routeShortName} scheduled=${t.scheduledDeparture.toISOString()} delay=${hasRealtime ? delayMinutes + "min" : "none"} -> ${time.toISOString()}`
      );
    }

    return {
      time,
      tripId: t.tripId,
      isRealtime: hasRealtime,
      delaySeconds: hasRealtime ? delayMinutes * 60 : 0,
      routeShortName: t.routeShortName ?? "",
      headsign: t.headsign ?? "",
      routeType: "0",
      rtStatus: hasRealtime ? "updated" : "scheduled",
    };
  });
}

export async function fetchDepartures(stopId, _query, options = {}) {
  const windowMinutes = options.windowMinutes ?? configuredWindowMinutes;
  const trips = await getUpcomingTripsForStop(stopId, windowMinutes);
  let delaysByLine = new Map();
  try {
    delaysByLine = await getDelaysByLine();
  } catch (err) {
    console.warn("kordis realtime fetch failed, using schedule only:", err.message);
  }
  return mergeWithRealtime(trips, delaysByLine);
}

export async function searchStops(name) {
  return findStopsByName(name);
}

export function configure(config = {}) {
  if (config.gtfsRefreshIntervalMs != null) {
    setRefreshIntervalMs(config.gtfsRefreshIntervalMs);
  }
  if (config.windowMinutes != null) {
    configuredWindowMinutes = config.windowMinutes;
  }
}
