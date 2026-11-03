/**
 * Which GTFS services run on a given day, and which trips at a stop fall in a time window.
 * Pure functions over the parsed timetable — no I/O.
 */

import { pragueServiceDay } from "../utils/time.js";

const CALENDAR_DAY_COLUMNS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function buildServiceCalendar(calendar, calendarDates) {
  const weekly = [];
  for (const row of calendar) {
    const serviceId = row.service_id ?? row.serviceid;
    const start = row.start_date ?? row.startdate;
    const end = row.end_date ?? row.enddate;
    if (!serviceId || !start || !end) continue;
    weekly.push({ serviceId, start, end, days: CALENDAR_DAY_COLUMNS.map((col) => row[col] === "1") });
  }

  // holidays and one-off days: exception_type 1 adds a service, 2 removes it
  const exceptions = new Map();
  for (const row of calendarDates) {
    const serviceId = row.service_id ?? row.serviceid;
    const type = row.exception_type ?? row.exceptiontype;
    if (!serviceId || !row.date) continue;
    const day = exceptions.get(row.date) ?? { added: new Set(), removed: new Set() };
    if (type === "1") day.added.add(serviceId);
    if (type === "2") day.removed.add(serviceId);
    exceptions.set(row.date, day);
  }

  return { weekly, exceptions, activeByDate: new Map() };
}

export function activeServiceIds(serviceCalendar, day) {
  const known = serviceCalendar.activeByDate.get(day.ymd);
  if (known) return known;

  const active = new Set();
  for (const s of serviceCalendar.weekly) {
    if (s.days[day.dayOfWeek] && day.ymd >= s.start && day.ymd <= s.end) active.add(s.serviceId);
  }
  const exceptions = serviceCalendar.exceptions.get(day.ymd);
  exceptions?.added.forEach((id) => active.add(id));
  exceptions?.removed.forEach((id) => active.delete(id));

  serviceCalendar.activeByDate.set(day.ymd, active);
  return active;
}

// stopTimes: [{ tripId, serviceId, stopSequence, departureMinutes, routeShortName, headsign }]
// lookbackMinutes keeps trips whose scheduled time has passed, so a late vehicle
// can still be shown once its delay is applied
export function tripsInWindow(stopTimes, serviceCalendar, now, windowMinutes, lookbackMinutes = 0) {
  const fromMs = now.getTime() - lookbackMinutes * 60000;
  const toMs = now.getTime() + windowMinutes * 60000;

  const result = [];
  // GTFS times run past 24:00, so yesterday's service is still running after midnight
  // and tomorrow's can start inside a window that crosses midnight
  for (const offsetDays of [-1, 0, 1]) {
    const day = pragueServiceDay(now, offsetDays);
    const active = activeServiceIds(serviceCalendar, day);
    for (const t of stopTimes) {
      if (!active.has(t.serviceId)) continue;
      const scheduledMs = day.startMs + Math.round(t.departureMinutes * 60000);
      if (scheduledMs < fromMs || scheduledMs > toMs) continue;
      result.push({
        tripId: t.tripId,
        serviceId: t.serviceId,
        serviceDay: day.ymd,
        stopSequence: t.stopSequence,
        scheduledDeparture: new Date(scheduledMs),
        routeShortName: t.routeShortName,
        headsign: t.headsign,
      });
    }
  }
  return result;
}
