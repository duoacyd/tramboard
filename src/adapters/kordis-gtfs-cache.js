/**
 * KORDIS GTFS cache. Downloads zip, parses into in-memory lookups, re-fetches when stale.
 */

import AdmZip from "adm-zip";
import { parseCsv } from "../utils/csv.js";
import {
  gtfsTimeToMinutesSinceMidnight,
  dateFromMinutesSinceMidnight,
  pragueServiceDay,
} from "../utils/time.js";
import { normalizeForSearch } from "../utils/string.js";
import { buildServiceCalendar, activeServiceIds, tripsInWindow } from "./gtfs-schedule.js";
import {
  GTFS_URL,
  GTFS_INCLUDED_ROUTE_TYPES,
  GTFS_FETCH_TIMEOUT_MS,
  GTFS_RETRY_BASE_MS,
  GTFS_RETRY_MAX_MS,
  ONE_DAY_MS,
  ONE_HOUR_MS,
} from "../config/constants.js";

let cache = null;
let lastFetchTime = 0;
let refreshIntervalMs = ONE_DAY_MS;
let fetchInFlight = null;
let consecutiveFailures = 0;
let retryNotBefore = 0;

function extractAndParse(zip, filename) {
  const entry = zip.getEntry(filename) ?? zip.getEntry(`gtfs/${filename}`);
  if (!entry || entry.isDirectory) {
    throw new Error(`gtfs zip missing: ${filename}`);
  }
  return parseCsv(entry.getData().toString("utf8"));
}

function buildStopsMap(stops) {
  const map = new Map();
  for (const row of stops) {
    const id = row.stop_id ?? row.stopid;
    if (!id) continue;
    map.set(id, {
      name: row.stop_name ?? row.stopname ?? "",
      lat: parseFloat(row.stop_lat ?? row.stoplat) || 0,
      lon: parseFloat(row.stop_lon ?? row.stoplon) || 0,
    });
  }
  return map;
}

function buildRoutesMap(routes) {
  const map = new Map();
  for (const row of routes) {
    const id = row.route_id ?? row.routeid;
    if (!id) continue;
    map.set(id, {
      routeShortName: row.route_short_name ?? row.routeshortname ?? "",
      routeType: String(row.route_type ?? row.routetype ?? ""),
    });
  }
  return map;
}

// every service is kept: which ones run is decided per query, so the cache stays
// correct across midnight and holidays no matter when it was downloaded
function buildTripsMap(trips, routesMap) {
  const map = new Map();
  for (const row of trips) {
    const id = row.trip_id ?? row.tripid;
    if (!id) continue;
    const route = routesMap.get(row.route_id ?? row.routeid);
    if (!route || !GTFS_INCLUDED_ROUTE_TYPES.has(String(route.routeType))) continue;
    map.set(id, {
      routeId: row.route_id ?? row.routeid,
      serviceId: row.service_id ?? row.serviceid,
      headsign: row.trip_headsign ?? row.tripheadsign ?? "",
      routeShortName: route.routeShortName,
    });
  }
  return map;
}

function buildStopTimesByStop(stopTimes, tripsMap) {
  const byStop = new Map();
  for (const row of stopTimes) {
    const stopId = row.stop_id ?? row.stopid;
    const tripId = row.trip_id ?? row.tripid;
    const depTime = row.departure_time ?? row.departuretime;
    if (!stopId || !tripId || !depTime) continue;
    const trip = tripsMap.get(tripId);
    if (!trip) continue;
    const arr = byStop.get(stopId) ?? [];
    arr.push({
      tripId,
      serviceId: trip.serviceId,
      stopSequence: parseInt(row.stop_sequence ?? row.stopsequence, 10) || 0,
      departureMinutes: gtfsTimeToMinutesSinceMidnight(depTime),
      routeShortName: trip.routeShortName,
      headsign: trip.headsign,
    });
    byStop.set(stopId, arr);
  }
  return byStop;
}

function buildTripStops(stopTimes, tripsMap) {
  const byTrip = new Map();
  for (const row of stopTimes) {
    const tripId = row.trip_id ?? row.tripid;
    if (!tripsMap.has(tripId)) continue;
    const dep = row.departure_time ?? row.departuretime;
    const arr = row.arrival_time ?? row.arrivaltime ?? dep;
    if (!dep) continue;
    const list = byTrip.get(tripId) ?? [];
    list.push({
      stopId: row.stop_id ?? row.stopid,
      seq: parseInt(row.stop_sequence ?? row.stopsequence, 10) || 0,
      arrivalMinutes: gtfsTimeToMinutesSinceMidnight(arr),
      departureMinutes: gtfsTimeToMinutesSinceMidnight(dep),
    });
    byTrip.set(tripId, list);
  }
  for (const list of byTrip.values()) list.sort((a, b) => a.seq - b.seq);
  return byTrip;
}

function buildLookups(stops, routes, trips, stopTimes, calendar, calendarDates) {
  const serviceCalendar = buildServiceCalendar(calendar, calendarDates);
  const stopsMap = buildStopsMap(stops);
  const routesMap = buildRoutesMap(routes);
  const tripsMap = buildTripsMap(trips, routesMap);
  const stopTimesByStop = buildStopTimesByStop(stopTimes, tripsMap);
  const tripStops = buildTripStops(stopTimes, tripsMap);
  const today = pragueServiceDay(new Date());
  const activeToday = activeServiceIds(serviceCalendar, today);
  if (activeToday.size === 0) console.warn(`[gtfs] no services active on ${today.ymd} — the feed may have expired`);
  console.log(
    `[gtfs] parsed: ${stopsMap.size} stops, ${routesMap.size} routes, ` +
    `${trips.length} trips, ${serviceCalendar.weekly.length} services (${activeToday.size} active today, ` +
    `${serviceCalendar.exceptions.size} exception dates), ` +
    `${stopTimes.length} stop_times → ${stopTimesByStop.size} stops with departures`
  );
  return { stopsMap, stopTimesByStop, tripStops, serviceCalendar };
}

function extractOptional(zip, filename) {
  try {
    return extractAndParse(zip, filename);
  } catch {
    return [];
  }
}

async function downloadAndBuildCache() {
  console.log(`[gtfs] downloading from ${GTFS_URL} …`);
  const t0 = Date.now();
  const res = await fetch(GTFS_URL, { signal: AbortSignal.timeout(GTFS_FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`gtfs download failed: ${res.status} ${res.statusText} for ${GTFS_URL}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`[gtfs] downloaded ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const zip = new AdmZip(buf);

  const stops = extractAndParse(zip, "stops.txt");
  const routes = extractAndParse(zip, "routes.txt");
  const trips = extractAndParse(zip, "trips.txt");
  const stopTimes = extractAndParse(zip, "stop_times.txt");
  const calendar = extractOptional(zip, "calendar.txt");
  const calendarDates = extractOptional(zip, "calendar_dates.txt");

  cache = buildLookups(stops, routes, trips, stopTimes, calendar, calendarDates);
  lastFetchTime = Date.now();
  const nextRefreshMin = Math.round(refreshIntervalMs / 60000);
  console.log(`[gtfs] next refresh in ${nextRefreshMin >= 60 ? (nextRefreshMin / 60).toFixed(0) + "h" : nextRefreshMin + "min"}`);
  return cache;
}

async function refreshCache(now) {
  try {
    const fresh = await downloadAndBuildCache();
    if (consecutiveFailures > 0) console.log("[gtfs] download recovered");
    consecutiveFailures = 0;
    retryNotBefore = 0;
    return fresh;
  } catch (err) {
    consecutiveFailures++;
    const backoffMs = Math.min(GTFS_RETRY_BASE_MS * 2 ** (consecutiveFailures - 1), GTFS_RETRY_MAX_MS);
    retryNotBefore = now + backoffMs;
    const retryIn = `retry in ${Math.round(backoffMs / 60000)} min`;
    if (!cache) {
      console.error(`[gtfs] download failed (${consecutiveFailures}x), no timetable yet, ${retryIn}: ${err.message}`);
      throw err;
    }
    const ageHours = ((now - lastFetchTime) / ONE_HOUR_MS).toFixed(0);
    console.warn(`[gtfs] refresh failed (${consecutiveFailures}x), keeping timetable from ${ageHours}h ago, ${retryIn}: ${err.message}`);
    return cache;
  }
}

async function ensureCache() {
  const now = Date.now();
  if (cache && now - lastFetchTime < refreshIntervalMs) {
    if (DEBUG) console.debug(`[gtfs] cache hit (age ${Math.round((now - lastFetchTime) / 60000)}min)`);
    return cache;
  }
  // services are picked per day, so an old timetable stays correct until KORDIS changes it;
  // a failed refresh must not blank the board
  if (now < retryNotBefore) {
    if (cache) return cache;
    throw new Error(`timetable not loaded yet, next download attempt in ${Math.ceil((retryNotBefore - now) / 1000)}s`);
  }

  if (!fetchInFlight) {
    fetchInFlight = refreshCache(now).finally(() => {
      fetchInFlight = null;
    });
  }
  // with a timetable in hand, requests don't wait for the re-download
  return cache ?? fetchInFlight;
}

const DEBUG = !!process.env.DEBUG;

export async function getUpcomingTripsForStop(stopId, windowMinutes, lookbackMinutes = 0, now = new Date()) {
  const { stopTimesByStop, serviceCalendar } = await ensureCache();
  const trips = stopTimesByStop.get(stopId);
  if (!trips?.length) return [];

  const result = tripsInWindow(trips, serviceCalendar, now, windowMinutes, lookbackMinutes);

  if (DEBUG) {
    for (const r of result) {
      console.debug(
        `[gtfs] stop=${stopId} line=${r.routeShortName} tripId=${r.tripId} service=${r.serviceId}@${r.serviceDay} scheduledDeparture=${r.scheduledDeparture.toISOString()}`
      );
    }
    console.debug(`[gtfs] stop=${stopId}: ${result.length} trips in window`);
    // detect duplicates: same line + same scheduled minute
    const seen = new Map();
    for (const r of result) {
      const key = `${r.routeShortName}|${r.scheduledDeparture.toISOString()}`;
      if (seen.has(key)) {
        console.warn(`[gtfs] DUPLICATE at stop=${stopId}: line=${r.routeShortName} time=${r.scheduledDeparture.toISOString()} tripIds=${seen.get(key)} vs ${r.tripId}`);
      } else {
        seen.set(key, r.tripId);
      }
    }
  }

  return result;
}

export async function findStopsByName(name) {
  const { stopsMap } = await ensureCache();
  const query = normalizeForSearch(name);
  if (!query) return [];

  const results = [];
  for (const [id, stop] of stopsMap) {
    if (normalizeForSearch(stop.name).includes(query)) {
      results.push({ id, ...stop });
    }
  }
  return results;
}

export function getTripStops(tripId) {
  return cache?.tripStops.get(tripId) ?? null;
}

export function getStopCoords(stopId) {
  const stop = cache?.stopsMap.get(stopId);
  return stop ? { lat: stop.lat, lon: stop.lon } : null;
}

export function dateForGtfsMinutesNear(minutes, nearMs) {
  const base = dateFromMinutesSinceMidnight(new Date(nearMs), minutes).getTime();
  // the trip may belong to the previous or next service day around midnight
  return [-ONE_DAY_MS, 0, ONE_DAY_MS]
    .map((offset) => new Date(base + offset))
    .reduce((best, d) => (Math.abs(d - nearMs) < Math.abs(best - nearMs) ? d : best));
}

export function setRefreshIntervalMs(ms) {
  refreshIntervalMs = ms;
}

export { GTFS_URL, STOP_ID_PREFIX, LINE_ID_PREFIX } from "../config/constants.js";
