import test from "node:test";
import assert from "node:assert/strict";

import {
  filterUpcomingMatches,
  selectScheduleMatches,
} from "../live-data-cache.mjs";

const now = new Date("2026-06-20T12:00:00+08:00");

test("filterUpcomingMatches removes completed and expired fixtures", () => {
  const matches = [
    { date: "6/16 01:00", status: "pre", teamA: "旧主队", teamB: "旧客队" },
    { date: "6/21 01:00", status: "pre", teamA: "荷兰", teamB: "瑞典" },
    { date: "6/22 01:00", status: "FT", teamA: "已赛主队", teamB: "已赛客队" },
  ];

  assert.deepEqual(filterUpcomingMatches(matches, now), [
    { date: "6/21 01:00", status: "pre", teamA: "荷兰", teamB: "瑞典" },
  ]);
});

test("selectScheduleMatches falls back to the latest cached future fixtures", () => {
  const cachedMatches = [
    { date: "6/16 01:00", status: "pre", teamA: "旧主队", teamB: "旧客队" },
    { date: "6/21 04:00", status: "pre", teamA: "德国", teamB: "科特迪瓦" },
  ];

  assert.deepEqual(selectScheduleMatches([], cachedMatches, now), [
    { date: "6/21 04:00", status: "pre", teamA: "德国", teamB: "科特迪瓦" },
  ]);
});
