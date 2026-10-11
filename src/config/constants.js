/**
 * Central constants. No magic numbers in adapters.
 */

export const ONE_DAY_MS = 86400000;
export const ONE_HOUR_MS = 3600000;
export const CACHE_TTL_REALTIME_MS = 30000;
export const REALTIME_RETRY_BASE_MS = 60000;
export const REALTIME_RETRY_MAX_MS = 30 * 60000;
export const REALTIME_MAX_AGE_MS = 180000;
export const REALTIME_MAX_DELAY_MIN = 120;

export const GTFS_URL =
  "https://kordis-jmk.cz/gtfs/gtfs.zip";
export const VEHICLE_POSITIONS_URL = "https://kordis-jmk.cz/gtfs/gtfsReal.dat";

// route types to include: 0 = tram, 3 = bus
export const GTFS_INCLUDED_ROUTE_TYPES = new Set(["0", "3"]);

// kordis uses U prefix for stop_id (e.g. U123) per their gtfs convention
export const STOP_ID_PREFIX = "U";
export const LINE_ID_PREFIX = "L";

export const TIMEZONE = "Europe/Prague";
export const DEFAULT_WINDOW_MINUTES = 120;
export const WEB_MAX_DISPLAY_ROWS = 6;

export const OPENMETEO_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=49.1951&longitude=16.6068" +
  "&current=temperature_2m,apparent_temperature,weather_code" +
  "&hourly=weather_code&daily=sunrise,sunset&forecast_days=2&timezone=Europe%2FPrague";
export const CACHE_TTL_WEATHER_MS = 10 * 60 * 1000; // 10 min

export const NAMEDAY_URL = "https://nameday.abalin.net/api/V2/today?timezone=Europe%2FPrague";
