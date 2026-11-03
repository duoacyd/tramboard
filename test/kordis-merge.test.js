import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeWithRealtime } from "../src/adapters/kordis.js";

const now = new Date("2026-11-10T07:30:00+01:00");
const minutes = (m) => new Date(now.getTime() + m * 60000);
const trip = (tripId, offsetMinutes) => ({
  tripId, stopSequence: 10, scheduledDeparture: minutes(offsetMinutes), routeShortName: "4", headsign: "Test",
});

test("a late tram stays on the board after its scheduled time", () => {
  const status = new Map([["late", { delayMinutes: 13, nextStopSequence: 10 }]]);
  const [dep] = mergeWithRealtime([trip("late", -10)], status, now);
  assert.equal(dep.time.toISOString(), minutes(3).toISOString());
  assert.equal(dep.delaySeconds, 13 * 60);
  assert.equal(dep.isRealtime, true);
});

test("a tram whose next stop is past ours has left, however late", () => {
  const status = new Map([["gone", { delayMinutes: 20, nextStopSequence: 11 }]]);
  assert.equal(mergeWithRealtime([trip("gone", -10)], status, now).length, 0);
});

test("without live data, only trams scheduled from now on are shown", () => {
  const result = mergeWithRealtime([trip("past", -5), trip("future", 5)], new Map(), now);
  assert.deepEqual(result.map((d) => d.tripId), ["future"]);
  assert.equal(result[0].isRealtime, false);
});
