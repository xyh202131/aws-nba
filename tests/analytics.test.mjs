import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeShots, byPeriod, percent } from "../src/analytics.ts";

const records = JSON.parse(
  readFileSync(new URL("../src/data/shots.json", import.meta.url), "utf8"),
);

test("empty samples remain unknown instead of displaying a zero accuracy", () => {
  assert.deepEqual(summarizeShots([]), {
    attempts: 0,
    made: 0,
    points: 0,
    fieldGoalPercent: null,
    meanXfg: null,
  });
  assert.equal(percent(null), "—");
  assert.deepEqual(byPeriod([]), []);
});

test("Amen official sample has 8 makes in 18 attempts, independent of the selected made clip", () => {
  const summary = summarizeShots(
    records.filter((r) => r.player_id === "1641708"),
  );
  assert.equal(summary.attempts, 18);
  assert.equal(summary.made, 8);
  assert.equal(summary.points, 16);
  assert.equal(percent(summary.fieldGoalPercent), "44.4%");
  assert.equal(percent(summary.meanXfg), "42.8%");
});

test("Flagg sample has 13 makes, 27 points and 47.6 percent average xFG", () => {
  const summary = summarizeShots(
    records.filter((r) => r.player_id === "1642843"),
  );
  assert.equal(summary.attempts, 23);
  assert.equal(summary.made, 13);
  assert.equal(summary.points, 27);
  assert.equal(percent(summary.fieldGoalPercent), "56.5%");
  assert.equal(percent(summary.meanXfg), "47.6%");
});

test("quarter filtering preserves the four known Amen splits", () => {
  const quarters = byPeriod(
    records.filter((r) => r.player_id === "1641708").reverse(),
  );
  assert.deepEqual(
    quarters.map((r) => [r.period, r.made, r.attempts]),
    [
      [1, 3, 6],
      [2, 1, 3],
      [3, 2, 4],
      [4, 2, 5],
    ],
  );
});

test("made shots do not get assigned 100 percent xFG", () => {
  const single = summarizeShots(
    records.filter(
      (r) => r.game_id === "0022500491" && r.official_event_id === 396,
    ),
  );
  assert.equal(single.fieldGoalPercent, 100);
  assert.equal(single.meanXfg, 44.5);
});
