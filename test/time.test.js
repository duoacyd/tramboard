import { test } from "node:test";
import assert from "node:assert/strict";
import { gtfsTimeToMinutesSinceMidnight, pragueServiceDay } from "../src/utils/time.js";

test("GTFS times parse with and without zero padding, including past midnight", () => {
  assert.equal(gtfsTimeToMinutesSinceMidnight("6:25:00"), 385);
  assert.equal(gtfsTimeToMinutesSinceMidnight("06:25:30"), 385.5);
  assert.equal(gtfsTimeToMinutesSinceMidnight("24:18:00"), 1458);
});

test("service day uses the Prague date, not UTC", () => {
  // 23:30 UTC on 3 Nov is already 00:30 on 4 Nov in Prague
  const day = pragueServiceDay(new Date("2026-11-03T23:30:00Z"));
  assert.equal(day.ymd, "20261104");
  assert.equal(day.dayOfWeek, 3);
  assert.equal(new Date(day.startMs).toISOString(), "2026-11-03T23:00:00.000Z");
});

test("service day offsets cross month and year boundaries", () => {
  assert.equal(pragueServiceDay(new Date("2026-12-01T08:00:00Z"), -1).ymd, "20261130");
  assert.equal(pragueServiceDay(new Date("2026-12-31T08:00:00Z"), 1).ymd, "20270101");
});

test("service day starts at noon minus 12h on DST change days", () => {
  // clocks go back 25 Oct: noon is CET, so the day counts from 23:00 UTC the evening before
  assert.equal(new Date(pragueServiceDay(new Date("2026-10-25T12:00:00Z")).startMs).toISOString(), "2026-10-24T23:00:00.000Z");
  // clocks go forward 29 Mar: noon is CEST
  assert.equal(new Date(pragueServiceDay(new Date("2026-03-29T12:00:00Z")).startMs).toISOString(), "2026-03-28T22:00:00.000Z");
});
