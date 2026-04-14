/**
 * Open-Meteo weather for Brno: current temperature + today's sunrise/sunset.
 * No API key required. Cache for 10 minutes.
 */

import fetch from "node-fetch";
import { OPENMETEO_URL, CACHE_TTL_WEATHER_MS } from "../config/constants.js";

const DEBUG = !!process.env.DEBUG;

let cached = null;
let cacheTime = 0;

/** Convert open-meteo local datetime string (no TZ) to a proper ISO 8601 string. */
function toZonedISO(localDateStr, utcOffsetSeconds) {
  const sign = utcOffsetSeconds >= 0 ? "+" : "-";
  const abs = Math.abs(utcOffsetSeconds);
  const hh = String(Math.floor(abs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
  return `${localDateStr}:00${sign}${hh}:${mm}`;
}

/** @returns {{ temp: number|null, sunrise: string|null, sunset: string|null }} */
export async function getWeatherBrno() {
  const now = Date.now();
  if (cached !== null && now - cacheTime < CACHE_TTL_WEATHER_MS) {
    if (DEBUG) console.debug(`[openmeteo] cache hit: ${cached.temp}°C`);
    return cached;
  }

  try {
    const res = await fetch(OPENMETEO_URL);
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const json = await res.json();

    const temp = json?.current?.temperature_2m;
    if (temp == null || Number.isNaN(Number(temp))) throw new Error("unexpected open-meteo response shape");

    const offset = json?.utc_offset_seconds ?? 0;
    const sunrise = json?.daily?.sunrise?.[0] ? toZonedISO(json.daily.sunrise[0], offset) : null;
    const sunset  = json?.daily?.sunset?.[0]  ? toZonedISO(json.daily.sunset[0],  offset) : null;

    cached = { temp: Math.round(temp), sunrise, sunset };
    cacheTime = now;
    console.log(`[openmeteo] ${cached.temp}°C  sunrise=${sunrise}  sunset=${sunset}`);
    return cached;
  } catch (err) {
    console.warn("[openmeteo] fetch failed:", err.message);
    if (cached !== null) {
      console.warn(`[openmeteo] serving stale value: ${cached.temp}°C`);
      return cached;
    }
    return null;
  }
}
