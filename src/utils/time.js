/**
 * Time utilities for Prague timezone and GTFS time handling.
 */

import { TIMEZONE } from "../config/constants.js";

/**
 * Current time (real UTC Date, kept for callers that need a Date reference).
 */
export function nowInPrague() {
  return new Date();
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
 * Build a correct UTC Date from a Prague calendar date + minutes since Prague midnight.
 *
 * The GTFS minutes are Prague local time. We must subtract the Prague UTC offset
 * so that formatTime (which re-applies the Prague timezone) shows the right time.
 */
export function dateFromMinutesSinceMidnight(baseDate, minutes) {
  const totalMins = Math.floor(minutes);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const s = Math.round((minutes % 1) * 60);

  // Get the Prague calendar date (YYYY-MM-DD) for baseDate
  const dateStr = baseDate.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
  const [year, month, day] = dateStr.split("-").map(Number);

  // Build "Prague wall clock as UTC" milliseconds
  const wallClockAsUtcMs = Date.UTC(year, month - 1, day, h, m, s);

  // Compute the Prague UTC offset at baseDate (e.g. +7200000 for CEST)
  const pragueSv = new Date(baseDate).toLocaleString("sv", { timeZone: TIMEZONE });
  const wallOfBaseMs = new Date(pragueSv.replace(" ", "T") + "Z").getTime();
  const utcOffsetMs = wallOfBaseMs - baseDate.getTime();

  return new Date(wallClockAsUtcMs - utcOffsetMs);
}
