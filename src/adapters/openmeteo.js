/**
 * Open-Meteo weather for Brno: current temperature + today's sunrise/sunset.
 * No API key required. Cache for 10 minutes.
 */

import { OPENMETEO_URL, CACHE_TTL_WEATHER_MS, FETCH_TIMEOUT_MS } from "../config/constants.js";

const DEBUG = !!process.env.DEBUG;

let cached = null;
let cacheTime = 0;

function codeToEmoji(code) {
  if (code >= 95) return "⛈";
  if (code === 85 || code === 86 || (code >= 71 && code <= 77)) return "🌨";
  if ((code >= 80 && code <= 82) || (code >= 61 && code <= 67)) return "🌧";
  if (code >= 51 && code <= 57) return "🌦";
  return null;
}

/** Scan hourly forecast for the first significant weather event within windowHours. */
function findAlert(currentCode, hourlyTimes, hourlyCodes, windowHours = 3) {
  const currentEmoji = codeToEmoji(currentCode);
  if (currentEmoji) return { emoji: currentEmoji, hoursAhead: 0 };

  const nowPragueHour = new Date().toLocaleString("sv", { timeZone: "Europe/Prague" }).slice(0, 13).replace(" ", "T");
  const baseIdx = hourlyTimes.findIndex((t) => t.startsWith(nowPragueHour));
  if (baseIdx === -1) {
    console.warn(`[openmeteo] could not find current hour ${nowPragueHour} in hourly data`);
    return null;
  }

  const upcoming = Array.from({ length: windowHours }, (_, i) => {
    const idx = baseIdx + i + 1;
    return `+${i + 1}h:${hourlyCodes[idx] ?? "?"}`;
  }).join(" ");
  console.log(`[openmeteo] hourly codes — now:${currentCode} ${upcoming}`);

  for (let h = 1; h <= windowHours; h++) {
    const code = Number(hourlyCodes[baseIdx + h]);
    const emoji = codeToEmoji(code);
    if (emoji) return { emoji, hoursAhead: h };
  }
  return null;
}

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
    const res = await fetch(OPENMETEO_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const json = await res.json();

    const temp = json?.current?.temperature_2m;
    if (temp == null || Number.isNaN(Number(temp))) throw new Error("unexpected open-meteo response shape");

    const apparent     = json?.current?.apparent_temperature;
    const currentCode  = json?.current?.weather_code ?? 0;
    const hourlyTimes  = json?.hourly?.time ?? [];
    const hourlyCodes  = json?.hourly?.weather_code ?? [];
    const offset       = json?.utc_offset_seconds ?? 0;
    const sunrise      = json?.daily?.sunrise?.[0] ? toZonedISO(json.daily.sunrise[0], offset) : null;
    const sunset       = json?.daily?.sunset?.[0]  ? toZonedISO(json.daily.sunset[0],  offset) : null;
    const alert        = findAlert(currentCode, hourlyTimes, hourlyCodes);

    cached = { temp: Math.round(temp), apparent: apparent != null ? Math.round(apparent) : null, sunrise, sunset, alert };
    cacheTime = now;
    console.log(`[openmeteo] ${cached.temp}°C (pocit ${cached.apparent}°C)  alert=${alert ? alert.emoji + (alert.hoursAhead ? ` in ${alert.hoursAhead}h` : " now") : "none"}  sunrise=${sunrise}  sunset=${sunset}`);
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
