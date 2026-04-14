/**
 * Open-Meteo current temperature for Brno. No API key required.
 * Cache for 10 minutes — temperature doesn't change faster than departures.
 */

import fetch from "node-fetch";
import { ONE_HOUR_MS } from "../config/constants.js";

const DEBUG = !!process.env.DEBUG;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=49.1951&longitude=16.6068" +
  "&current=temperature_2m&timezone=Europe%2FPrague";

let cached = null;
let cacheTime = 0;

export async function getCurrentTemperatureBrno() {
  const now = Date.now();
  if (cached !== null && now - cacheTime < CACHE_TTL_MS) {
    if (DEBUG) console.debug(`[openmeteo] cache hit: ${cached}°C (${Math.round((CACHE_TTL_MS - (now - cacheTime)) / 60000)}min remaining)`);
    return cached;
  }

  try {
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const json = await res.json();
    const temp = json?.current?.temperature_2m;
    if (temp == null || Number.isNaN(Number(temp))) throw new Error("unexpected open-meteo response shape");
    cached = Math.round(temp);
    cacheTime = now;
    console.log(`[openmeteo] ${cached}°C`);
    return cached;
  } catch (err) {
    console.warn("[openmeteo] fetch failed:", err.message);
    if (cached !== null) {
      console.warn(`[openmeteo] serving stale value: ${cached}°C`);
      return cached;
    }
    return null;
  }
}
