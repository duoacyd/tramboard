/**
 * KORDIS GTFS cache. Downloads zip, parses into in-memory lookups, re-fetches when stale.
 */

import AdmZip from "adm-zip";
import fetch from "node-fetch";
import { parseCsv } from "../utils/csv.js";
import {
  formatDateForCalendar,
  gtfsTimeToMinutesSinceMidnight,
  minutesSinceMidnightPrague,
  nowInPrague,
  dateFromMinutesSinceMidnight,
} from "../utils/time.js";
import { normalizeForSearch } from "../utils/string.js";
import {
  GTFS_URL,
  GTFS_ROUTE_TYPE_TRAM,
  ONE_DAY_MS,
} from "../config/constants.js";

let cache = null;
let lastFetchTime = 0;
let refreshIntervalMs = ONE_DAY_MS;

const CALENDAR_DAY_COLUMNS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function extractAndParse(zip, filename) {
  const entry = zip.getEntry(filename) ?? zip.getEntry(`gtfs/${filename}`);
  if (!entry || entry.isDirectory) {
    throw new Error(`gtfs zip missing: ${filename}`);
  }
  return parseCsv(entry.getData().toString("utf8"));
}

function getActiveServiceIds(calendar, now) {
  const today = formatDateForCalendar(now);
  const dow = now.getDay();
  const dayCol = CALENDAR_DAY_COLUMNS[dow];
  const active = new Set();
  for (const row of calendar) {
    const start = row.start_date ?? row.startdate;
    const end = row.end_date ?? row.enddate;
    if (!start || !end || today < start || today > end) continue;
    if (row[dayCol] === "1") {
      active.add(row.service_id ?? row.serviceid);
    }
  }
  return active;
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

function buildTripsMap(trips, routesMap, activeServiceIds) {
  const serviceFilter =
    activeServiceIds.size > 0
      ? (sid) => activeServiceIds.has(sid)
      : () => true;

  const map = new Map();
  for (const row of trips) {
    const id = row.trip_id ?? row.tripid;
    if (!id || !serviceFilter(row.service_id ?? row.serviceid)) continue;
    const route = routesMap.get(row.route_id ?? row.routeid);
    if (!route || route.routeType !== GTFS_ROUTE_TYPE_TRAM) continue;
    map.set(id, {
      routeId: row.route_id ?? row.routeid,
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
      departureTime: depTime,
      routeShortName: trip.routeShortName,
      headsign: trip.headsign,
    });
    byStop.set(stopId, arr);
  }
  for (const arr of byStop.values()) {
    arr.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  }
  return byStop;
}

function buildLookups(stops, routes, trips, stopTimes, calendar) {
  const now = new Date();
  const activeServiceIds = getActiveServiceIds(calendar, now);
  const stopsMap = buildStopsMap(stops);
  const routesMap = buildRoutesMap(routes);
  const tripsMap = buildTripsMap(trips, routesMap, activeServiceIds);
  const stopTimesByStop = buildStopTimesByStop(stopTimes, tripsMap);
  return { stopsMap, stopTimesByStop };
}

async function ensureCache() {
  const now = Date.now();
  if (cache && now - lastFetchTime < refreshIntervalMs) return cache;

  const res = await fetch(GTFS_URL);
  if (!res.ok) {
    throw new Error(`gtfs download failed: ${res.status} ${res.statusText} for ${GTFS_URL}`);
  }
  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));

  const stops = extractAndParse(zip, "stops.txt");
  const routes = extractAndParse(zip, "routes.txt");
  const trips = extractAndParse(zip, "trips.txt");
  const stopTimes = extractAndParse(zip, "stop_times.txt");
  let calendar = [];
  try {
    calendar = extractAndParse(zip, "calendar.txt");
  } catch {
    // calendar_dates.txt fallback not implemented
  }

  cache = buildLookups(stops, routes, trips, stopTimes, calendar);
  lastFetchTime = now;
  return cache;
}

export async function getUpcomingTripsForStop(stopId, windowMinutes) {
  const { stopTimesByStop } = await ensureCache();
  const trips = stopTimesByStop.get(stopId);
  if (!trips?.length) return [];

  const pragueNow = nowInPrague();
  const nowMinutes = minutesSinceMidnightPrague(pragueNow);
  const windowEnd = nowMinutes + windowMinutes;
  const dayMinutes = 24 * 60;

  const result = [];
  for (const t of trips) {
    let depMinutes = gtfsTimeToMinutesSinceMidnight(t.departureTime);
    if (depMinutes < nowMinutes - 60) depMinutes += dayMinutes;
    if (depMinutes < nowMinutes || depMinutes > windowEnd) continue;

    result.push({
      tripId: t.tripId,
      scheduledDeparture: dateFromMinutesSinceMidnight(pragueNow, depMinutes),
      routeShortName: t.routeShortName,
      headsign: t.headsign,
    });
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

export function setRefreshIntervalMs(ms) {
  refreshIntervalMs = ms;
}

export { GTFS_URL, STOP_ID_PREFIX, LINE_ID_PREFIX } from "../config/constants.js";
