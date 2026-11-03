/**
 * KORDIS GTFS cache. Downloads zip, parses into in-memory lookups, re-fetches when stale.
 */

import AdmZip from "adm-zip";
import fetch from "node-fetch";
import { parseCsv } from "../utils/csv.js";
import {
  gtfsTimeToMinutesSinceMidnight,
  dateFromMinutesSinceMidnight,
  pragueServiceDay,
} from "../utils/time.js";
import { normalizeForSearch } from "../utils/string.js";
import {
  GTFS_URL,
  GTFS_INCLUDED_ROUTE_TYPES,
  ONE_DAY_MS,
} from "../config/constants.js";

let cache = null;
let lastFetchTime = 0;
let refreshIntervalMs = ONE_DAY_MS;
let fetchInFlight = null;

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

function buildServiceCalendar(calendar, calendarDates) {
  const weekly = [];
  for (const row of calendar) {
    const serviceId = row.service_id ?? row.serviceid;
    const start = row.start_date ?? row.startdate;
    const end = row.end_date ?? row.enddate;
    if (!serviceId || !start || !end) continue;
    weekly.push({ serviceId, start, end, days: CALENDAR_DAY_COLUMNS.map((col) => row[col] === "1") });
  }

  // holidays and one-off days: exception_type 1 adds a service, 2 removes it
  const exceptions = new Map();
  for (const row of calendarDates) {
    const serviceId = row.service_id ?? row.serviceid;
    const type = row.exception_type ?? row.exceptiontype;
    if (!serviceId || !row.date) continue;
    const day = exceptions.get(row.date) ?? { added: new Set(), removed: new Set() };
    if (type === "1") day.added.add(serviceId);
    if (type === "2") day.removed.add(serviceId);
    exceptions.set(row.date, day);
  }

  return { weekly, exceptions, activeByDate: new Map() };
}

function activeServiceIds(serviceCalendar, day) {
  const known = serviceCalendar.activeByDate.get(day.ymd);
  if (known) return known;

  const active = new Set();
  for (const s of serviceCalendar.weekly) {
    if (s.days[day.dayOfWeek] && day.ymd >= s.start && day.ymd <= s.end) active.add(s.serviceId);
  }
  const exceptions = serviceCalendar.exceptions.get(day.ymd);
  exceptions?.added.forEach((id) => active.add(id));
  exceptions?.removed.forEach((id) => active.delete(id));

  serviceCalendar.activeByDate.set(day.ymd, active);
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
  const res = await fetch(GTFS_URL);
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

async function ensureCache() {
  const now = Date.now();
  if (cache && now - lastFetchTime < refreshIntervalMs) {
    if (DEBUG) console.debug(`[gtfs] cache hit (age ${Math.round((now - lastFetchTime) / 60000)}min)`);
    return cache;
  }
  if (fetchInFlight) return fetchInFlight;

  fetchInFlight = downloadAndBuildCache().finally(() => {
    fetchInFlight = null;
  });
  return fetchInFlight;
}

const DEBUG = !!process.env.DEBUG;

// lookbackMinutes keeps trips whose scheduled time has passed, so a late vehicle
// can still be shown once its delay is applied
export async function getUpcomingTripsForStop(stopId, windowMinutes, lookbackMinutes = 0, now = new Date()) {
  const { stopTimesByStop, serviceCalendar } = await ensureCache();
  const trips = stopTimesByStop.get(stopId);
  if (!trips?.length) return [];

  const fromMs = now.getTime() - lookbackMinutes * 60000;
  const toMs = now.getTime() + windowMinutes * 60000;

  const result = [];
  // GTFS times run past 24:00, so yesterday's service is still running after midnight
  // and tomorrow's can start inside a window that crosses midnight
  for (const offsetDays of [-1, 0, 1]) {
    const day = pragueServiceDay(now, offsetDays);
    const active = activeServiceIds(serviceCalendar, day);
    for (const t of trips) {
      if (!active.has(t.serviceId)) continue;
      const scheduledMs = day.startMs + Math.round(t.departureMinutes * 60000);
      if (scheduledMs < fromMs || scheduledMs > toMs) continue;

      const dep = {
        tripId: t.tripId,
        stopSequence: t.stopSequence,
        scheduledDeparture: new Date(scheduledMs),
        routeShortName: t.routeShortName,
        headsign: t.headsign,
      };

      if (DEBUG) {
        console.debug(
          `[gtfs] stop=${stopId} line=${t.routeShortName} tripId=${t.tripId} service=${t.serviceId}@${day.ymd} depMinutes=${t.departureMinutes} scheduledDeparture=${dep.scheduledDeparture.toISOString()}`
        );
      }

      result.push(dep);
    }
  }

  if (DEBUG) {
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
