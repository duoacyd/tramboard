/**
 * Brno ArcGIS vehicle positions. Tram delays, 10s cache.
 */

import fetch from "node-fetch";
import {
  VEHICLE_POSITIONS_QUERY_URL,
  CACHE_TTL_REALTIME_MS,
  VTYPE_TRAM,
} from "../config/constants.js";

const DEBUG = !!process.env.DEBUG;

let cachedDelays = null;
let cacheTime = 0;

function buildQueryUrl() {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "lineid,linename,delay,laststopid,finalstopid,vtype",
    f: "json",
    returnGeometry: "false",
  });
  return `${VEHICLE_POSITIONS_QUERY_URL}?${params}`;
}

function normalizeLineKey(lineid) {
  return String(lineid ?? "").replace(/^L/i, "") || String(lineid);
}

function isInactive(attrs) {
  const v = attrs.isinactive;
  return v === true || v === "true" || v === 1;
}

async function fetchVehiclePositions() {
  const res = await fetch(buildQueryUrl());
  if (!res.ok) {
    throw new Error(`vehicle positions fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(`vehicle positions api error: ${json.error.message ?? JSON.stringify(json.error)}`);
  }

  const features = json.features ?? [];
  const delays = new Map();
  for (const f of features) {
    const attrs = f.attributes ?? {};
    if (isInactive(attrs) || Number(attrs.vtype) !== VTYPE_TRAM) continue;

    const lineid = attrs.lineid;
    const delay = parseFloat(attrs.delay);
    if (lineid == null || Number.isNaN(delay)) continue;

    const key = normalizeLineKey(lineid);
    const existing = delays.get(key) ?? 0;
    if (delay > existing) delays.set(key, Math.round(delay));
  }

  const delayed = [...delays.values()].filter((d) => d > 0).length;
  console.log(`[realtime] ${features.length} vehicles → ${delays.size} tram lines tracked, ${delayed} delayed`);
  if (DEBUG && delays.size > 0) {
    const summary = [...delays.entries()].map(([k, v]) => `${k}:+${v}min`).join(" ");
    console.debug(`[realtime] delays: ${summary}`);
  }

  return delays;
}

export async function getDelaysByLine() {
  const now = Date.now();
  if (cachedDelays !== null && now - cacheTime < CACHE_TTL_REALTIME_MS) {
    if (DEBUG) console.debug(`[realtime] cache hit (${Math.round((CACHE_TTL_REALTIME_MS - (now - cacheTime)) / 1000)}s remaining)`);
    return cachedDelays;
  }
  try {
    cachedDelays = await fetchVehiclePositions();
    cacheTime = now;
    return cachedDelays;
  } catch (err) {
    console.warn("[realtime] fetch failed:", err.message);
    if (cachedDelays !== null) {
      console.warn("[realtime] using stale cache");
      return cachedDelays;
    }
    throw err;
  }
}
