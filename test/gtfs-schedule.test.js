import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServiceCalendar, activeServiceIds, tripsInWindow } from "../src/adapters/gtfs-schedule.js";
import { pragueServiceDay } from "../src/utils/time.js";

const week = (days) => Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d, i) => [d, days[i]])
);

function calendar() {
  return buildServiceCalendar(
    [
      { service_id: "WK", ...week("1111100"), start_date: "20261030", end_date: "20261211" },
      { service_id: "SUN", ...week("0000011"), start_date: "20261030", end_date: "20261211" },
    ],
    // 17 Nov is a public holiday on a Tuesday: weekday service off, Sunday service on
    [
      { service_id: "WK", date: "20261117", exception_type: "2" },
      { service_id: "SUN", date: "20261117", exception_type: "1" },
    ]
  );
}

const trip = (tripId, serviceId, departureMinutes) => ({
  tripId, serviceId, departureMinutes, stopSequence: 5, routeShortName: "4", headsign: "Test",
});

const at = (iso) => new Date(iso);
const ids = (trips) => trips.map((t) => t.tripId).sort();

test("weekly services follow the day of week and date range", () => {
  const cal = calendar();
  assert.deepEqual([...activeServiceIds(cal, pragueServiceDay(at("2026-11-10T08:00:00+01:00")))], ["WK"]);
  assert.deepEqual([...activeServiceIds(cal, pragueServiceDay(at("2026-11-14T08:00:00+01:00")))], ["SUN"]);
  assert.equal(activeServiceIds(cal, pragueServiceDay(at("2026-12-15T08:00:00+01:00"))).size, 0);
});

test("calendar_dates exceptions swap the holiday timetable in", () => {
  const cal = calendar();
  assert.deepEqual([...activeServiceIds(cal, pragueServiceDay(at("2026-11-17T08:00:00+01:00")))], ["SUN"]);
});

test("trips are picked from the services running that day", () => {
  const stopTimes = [trip("weekday", "WK", 7 * 60 + 30), trip("sunday", "SUN", 7 * 60 + 30)];
  const normal = tripsInWindow(stopTimes, calendar(), at("2026-11-10T07:20:00+01:00"), 30);
  assert.deepEqual(ids(normal), ["weekday"]);
  assert.equal(normal[0].scheduledDeparture.toISOString(), "2026-11-10T06:30:00.000Z");

  const holiday = tripsInWindow(stopTimes, calendar(), at("2026-11-17T07:20:00+01:00"), 30);
  assert.deepEqual(ids(holiday), ["sunday"]);
});

test("yesterday's 24:xx trips still show after midnight", () => {
  const stopTimes = [trip("late-night", "WK", 24 * 60 + 18)];
  const result = tripsInWindow(stopTimes, calendar(), at("2026-11-10T00:05:00+01:00"), 60);
  assert.deepEqual(ids(result), ["late-night"]);
  assert.equal(result[0].serviceDay, "20261109");
  assert.equal(result[0].scheduledDeparture.toISOString(), "2026-11-09T23:18:00.000Z");
});

test("a window crossing midnight includes tomorrow's early trips", () => {
  const stopTimes = [trip("early", "WK", 10)];
  const result = tripsInWindow(stopTimes, calendar(), at("2026-11-09T23:40:00+01:00"), 60);
  assert.deepEqual(ids(result), ["early"]);
  assert.equal(result[0].serviceDay, "20261110");
});

test("lookback keeps trips whose scheduled time has just passed", () => {
  const stopTimes = [trip("past", "WK", 7 * 60 + 15)];
  const now = at("2026-11-10T07:20:00+01:00");
  assert.equal(tripsInWindow(stopTimes, calendar(), now, 30).length, 0);
  assert.equal(tripsInWindow(stopTimes, calendar(), now, 30, 10).length, 1);
});

test("times are right on the day clocks go back", () => {
  const cal = buildServiceCalendar([{ service_id: "SUN", ...week("0000001"), start_date: "20261001", end_date: "20261031" }], []);
  const result = tripsInWindow([trip("dst", "SUN", 10 * 60)], cal, at("2026-10-25T09:30:00+01:00"), 60);
  assert.equal(result[0].scheduledDeparture.toISOString(), "2026-10-25T09:00:00.000Z");
});
