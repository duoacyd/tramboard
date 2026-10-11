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
} from "../config/constants.js";
import { readFields, firstField } from "../utils/protobuf.js";
import { getScheduledDepartureNear } from "./kordis-gtfs-cache.js";

const DEBUG = !!process.env.DEBUG;

let cachedDelays = null;
let cacheTime = 0;
let consecutiveFailures = 0;
let retryNotBefore = 0;
let inFlight = null;

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
    const stopBytes = firstField(vehicle, 7);
    const timestamp = firstField(vehicle, 5);
    if (!tripBytes || !stopBytes || timestamp == null) continue;
    const tripId = firstField(readFields(tripBytes), 1)?.toString();
    if (!tripId) continue;
    vehicles.push({
      tripId,
      stopId: normalizeStopId(stopBytes.toString()),
      timestampMs: Number(timestamp) * 1000,
    });
  }
  return vehicles;
}

async function fetchTripDelays() {
  const res = await fetch(VEHICLE_POSITIONS_URL);
  if (!res.ok) {
    throw new Error(`vehicle positions fetch failed: ${res.status} ${res.statusText}`);
  }
  const vehicles = parseVehicles(Buffer.from(await res.arrayBuffer()));

  const now = Date.now();
  const delays = new Map();
  let delayed = 0;
  for (const v of vehicles) {
    if (now - v.timestampMs > REALTIME_MAX_AGE_MS) continue;
    const scheduled = getScheduledDepartureNear(v.tripId, v.stopId, v.timestampMs);
    if (!scheduled) continue;
    // a vehicle still heading to its next stop can only be shown as late, never early
    const delayMin = Math.round(Math.max(0, v.timestampMs - scheduled.getTime()) / 60000);
    if (delayMin > REALTIME_MAX_DELAY_MIN) continue;
    delays.set(v.tripId, delayMin);
    if (delayMin > 0) delayed++;
  }

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
