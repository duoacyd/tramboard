/**
 * KORDIS GTFS-Realtime vehicle positions. The feed has no delay field, so delay is
 * derived by comparing each vehicle's last report with the scheduled time at its next stop.
 */

import fetch from "node-fetch";
import {
  VEHICLE_POSITIONS_URL,
  CACHE_TTL_REALTIME_MS,
  REALTIME_RETRY_BASE_MS,
  REALTIME_RETRY_MAX_MS,
  REALTIME_MAX_AGE_MS,
  REALTIME_MAX_DELAY_MIN,
  REALTIME_SMOOTHING,
} from "../config/constants.js";
import { readFields, firstField } from "../utils/protobuf.js";
import { getTripStops, getStopCoords, dateForGtfsMinutesNear } from "./kordis-gtfs-cache.js";

const DEBUG = !!process.env.DEBUG;

let cachedDelays = null;
let cacheTime = 0;
let consecutiveFailures = 0;
let retryNotBefore = 0;
let inFlight = null;
let smoothedDelayMs = new Map();

// the feed zero-pads stop ids (U01149Z02); the timetable does not (U1149Z2)
function normalizeStopId(id) {
  return id.replace(/^U0*(\d+)Z0*(\d+)$/, "U$1Z$2");
}

function parseVehicles(buf) {
  const vehicles = [];
  for (const [field, entityBytes] of readFields(buf)) {
    if (field !== 2) continue;
    const vehicleBytes = firstField(readFields(entityBytes), 4);
    if (!vehicleBytes) continue;
    const vehicle = readFields(vehicleBytes);
    const tripBytes = firstField(vehicle, 1);
    const positionBytes = firstField(vehicle, 2);
    const stopBytes = firstField(vehicle, 7);
    const timestamp = firstField(vehicle, 5);
    if (!tripBytes || !stopBytes || !positionBytes || timestamp == null) continue;
    const tripId = firstField(readFields(tripBytes), 1)?.toString();
    if (!tripId) continue;
    const position = readFields(positionBytes);
    vehicles.push({
      tripId,
      lat: firstField(position, 1)?.readFloatLE(0),
      lon: firstField(position, 2)?.readFloatLE(0),
      stopId: normalizeStopId(stopBytes.toString()),
      timestampMs: Number(timestamp) * 1000,
    });
  }
  return vehicles;
}

// 0..1 = how far along the straight line from stop a to stop b the vehicle is
function fractionAlongSegment(vehicle, a, b) {
  const metersPerDegLat = 110540;
  const metersPerDegLon = 111320 * Math.cos((a.lat * Math.PI) / 180);
  const bx = (b.lon - a.lon) * metersPerDegLon;
  const by = (b.lat - a.lat) * metersPerDegLat;
  const px = (vehicle.lon - a.lon) * metersPerDegLon;
  const py = (vehicle.lat - a.lat) * metersPerDegLat;
  const lengthSq = bx * bx + by * by;
  if (lengthSq < 400) return 1;
  return Math.min(1, Math.max(0, (px * bx + py * by) / lengthSq));
}

// Delay = report time minus the scheduled time at the vehicle's position between its
// previous and next stop. Comparing only against the next stop would show a vehicle as
// late just once it is already past that stop's scheduled time.
function estimateDelayMs(vehicle) {
  const stops = getTripStops(vehicle.tripId);
  const idx = stops?.findIndex((s) => s.stopId === vehicle.stopId) ?? -1;
  if (idx < 0) return null;

  const next = stops[idx];
  const scheduledNext = dateForGtfsMinutesNear(next.arrivalMinutes, vehicle.timestampMs).getTime();
  const prev = stops[idx - 1];
  const a = prev && getStopCoords(prev.stopId);
  const b = getStopCoords(next.stopId);
  if (!a || !b || vehicle.lat == null || vehicle.lon == null) {
    return vehicle.timestampMs - scheduledNext;
  }

  const scheduledPrev = scheduledNext - (next.arrivalMinutes - prev.departureMinutes) * 60000;
  const fraction = fractionAlongSegment(vehicle, a, b);
  const scheduledHere = scheduledPrev + fraction * (scheduledNext - scheduledPrev);
  return vehicle.timestampMs - scheduledHere;
}

async function fetchTripDelays() {
  const res = await fetch(VEHICLE_POSITIONS_URL);
  if (!res.ok) {
    throw new Error(`vehicle positions fetch failed: ${res.status} ${res.statusText}`);
  }
  const vehicles = parseVehicles(Buffer.from(await res.arrayBuffer()));

  const now = Date.now();
  const delays = new Map();
  const nextSmoothed = new Map();
  let delayed = 0;
  for (const v of vehicles) {
    if (now - v.timestampMs > REALTIME_MAX_AGE_MS) continue;
    const rawMs = estimateDelayMs(v);
    if (rawMs == null) continue;
    // GPS and schedule rounding make single readings jump around the 1-minute mark
    const previousMs = smoothedDelayMs.get(v.tripId);
    const delayMs = previousMs == null
      ? rawMs
      : REALTIME_SMOOTHING * previousMs + (1 - REALTIME_SMOOTHING) * rawMs;
    nextSmoothed.set(v.tripId, delayMs);
    const delayMin = Math.floor(Math.max(0, delayMs) / 60000);
    if (delayMin > REALTIME_MAX_DELAY_MIN) continue;
    delays.set(v.tripId, delayMin);
    if (delayMin > 0) delayed++;
  }
  smoothedDelayMs = nextSmoothed;

  console.log(`[realtime] ${vehicles.length} vehicles → ${delays.size} matched to schedule, ${delayed} delayed`);
  if (DEBUG && delayed > 0) {
    const summary = [...delays.entries()].filter(([, d]) => d > 0).map(([k, v]) => `${k}:+${v}min`).join(" ");
    console.debug(`[realtime] delays: ${summary}`);
  }
  return delays;
}

export async function getDelaysByTrip() {
  const now = Date.now();
  if (cachedDelays !== null && now - cacheTime < CACHE_TTL_REALTIME_MS) {
    if (DEBUG) console.debug(`[realtime] cache hit (${Math.round((CACHE_TTL_REALTIME_MS - (now - cacheTime)) / 1000)}s remaining)`);
    return cachedDelays;
  }
  if (now < retryNotBefore) return cachedDelays ?? new Map();
  if (inFlight) return inFlight;

  inFlight = refreshDelays(now).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function refreshDelays(now) {
  try {
    cachedDelays = await fetchTripDelays();
    cacheTime = now;
    if (consecutiveFailures > 0) console.log("[realtime] feed recovered");
    consecutiveFailures = 0;
    retryNotBefore = 0;
    return cachedDelays;
  } catch (err) {
    consecutiveFailures++;
    const backoffMs = Math.min(REALTIME_RETRY_BASE_MS * 2 ** (consecutiveFailures - 1), REALTIME_RETRY_MAX_MS);
    retryNotBefore = now + backoffMs;
    console.warn(
      `[realtime] fetch failed (${consecutiveFailures}x), showing schedule only, retry in ${Math.round(backoffMs / 60000)} min: ${err.message}`
    );
    return cachedDelays ?? new Map();
  }
}
