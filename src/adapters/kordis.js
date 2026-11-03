/**
 * Main KORDIS adapter. GTFS + realtime, same interface as transitland.
 */

import {
  getUpcomingTripsForStop,
  findStopsByName,
  setRefreshIntervalMs,
} from "./kordis-gtfs-cache.js";
import { getDelaysByTrip } from "./kordis-realtime.js";
import { DEFAULT_WINDOW_MINUTES, REALTIME_MAX_DELAY_MIN } from "../config/constants.js";

let configuredWindowMinutes = DEFAULT_WINDOW_MINUTES;

const DEBUG = !!process.env.DEBUG;

export function mergeWithRealtime(trips, statusByTrip, now) {
  const merged = [];
  for (const t of trips) {
    const status = statusByTrip.get(t.tripId);
    const hasRealtime = status != null;
    // the vehicle's next stop is further along the trip than ours: it has already left
    if (hasRealtime && status.nextStopSequence > t.stopSequence) continue;
    const delayMinutes = hasRealtime ? status.delayMinutes : 0;
    const time = new Date(t.scheduledDeparture.getTime() + delayMinutes * 60000);
    if (time < now) continue;

    if (DEBUG) {
      console.debug(
        `[kordis] merge tripId=${t.tripId} line=${t.routeShortName} scheduled=${t.scheduledDeparture.toISOString()} delay=${hasRealtime ? delayMinutes + "min" : "none"} -> ${time.toISOString()}`
      );
    }

    merged.push({
      time,
      scheduledTime: new Date(t.scheduledDeparture),
      tripId: t.tripId,
      isRealtime: hasRealtime,
      delaySeconds: hasRealtime ? delayMinutes * 60 : 0,
      routeShortName: t.routeShortName ?? "",
      headsign: t.headsign ?? "",
      routeType: "0",
      rtStatus: hasRealtime ? "updated" : "scheduled",
    });
  }
  return merged;
}

export async function fetchDepartures(stopId, _query, options = {}) {
  const windowMinutes = options.windowMinutes ?? configuredWindowMinutes;
  const now = new Date();
  // look back as far as a delay can reach, otherwise a late tram vanishes at its scheduled time
  const trips = await getUpcomingTripsForStop(stopId, windowMinutes, REALTIME_MAX_DELAY_MIN, now);
  let statusByTrip = new Map();
  try {
    statusByTrip = await getDelaysByTrip();
  } catch (err) {
    console.warn("kordis realtime fetch failed, using schedule only:", err.message);
  }
  return mergeWithRealtime(trips, statusByTrip, now);
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
