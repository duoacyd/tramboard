/**
 * Time utilities for Prague timezone and GTFS time handling.
 */

import { TIMEZONE } from "../config/constants.js";

/**
 * Current time in Europe/Prague.
 */
export function nowInPrague() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: TIMEZONE })
  );
}

/**
 * Format date as YYYYMMDD for GTFS calendar comparison.
 */
export function formatDateForCalendar(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Parse GTFS time (HH:MM:SS or H:MM:SS) to minutes since midnight.
 * Handles overflow: 24:15:00 = next-day early am.
 */
export function gtfsTimeToMinutesSinceMidnight(gtfsTime) {
  const parts = (gtfsTime || "").trim().split(":");
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;
  return h * 60 + m + s / 60;
}

/**
 * Minutes since midnight for a date in Prague timezone.
 */
export function minutesSinceMidnightPrague(d) {
  const str = d.toLocaleTimeString("en-GB", { timeZone: TIMEZONE });
  const [h, m, s] = str.split(":").map(Number);
  return h * 60 + m + s / 60;
}

/**
 * Build a Date from Prague base date + minutes since midnight.
 */
export function dateFromMinutesSinceMidnight(baseDate, minutes) {
  const d = new Date(baseDate);
  const totalMins = Math.floor(minutes);
  d.setHours(
    Math.floor(totalMins / 60),
    totalMins % 60,
    Math.round((minutes % 1) * 60),
    0
  );
  return d;
}
