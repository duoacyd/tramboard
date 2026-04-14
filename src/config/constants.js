/**
 * Central constants. No magic numbers in adapters.
 */

export const ONE_DAY_MS = 86400000;
export const ONE_HOUR_MS = 3600000;
export const CACHE_TTL_REALTIME_MS = 10000;

export const GTFS_URL =
  "https://kordis-jmk.cz/gtfs/gtfs.zip";
export const VEHICLE_POSITIONS_BASE =
  "https://gis.brno.cz/ags1/rest/services/Hosted/ODAE_public_transit_positional_feature_service/FeatureServer/0";
export const VEHICLE_POSITIONS_QUERY_URL = `${VEHICLE_POSITIONS_BASE}/query`;

// route types to include: 0 = tram, 3 = bus
export const GTFS_INCLUDED_ROUTE_TYPES = new Set(["0", "3"]);
export const VTYPE_TRAM = 1;

// kordis uses U prefix for stop_id (e.g. U123) per their gtfs convention
export const STOP_ID_PREFIX = "U";
export const LINE_ID_PREFIX = "L";

export const TIMEZONE = "Europe/Prague";
export const DEFAULT_WINDOW_MINUTES = 90;
export const WEB_MAX_DISPLAY_ROWS = 5;

export const OPENMETEO_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=49.1951&longitude=16.6068" +
  "&current=temperature_2m&timezone=Europe%2FPrague";
export const CACHE_TTL_WEATHER_MS = 10 * 60 * 1000; // 10 min
