import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  inspectReview,
  reviewPayload,
  momentAt,
  evidenceFor,
  MAX_REVIEW_BYTES,
} from "../src/review.ts";
const clips = JSON.parse(
  readFileSync(new URL("../src/data/clips.json", import.meta.url), "utf8"),
);

test("timeline selects context, release, and result without conflating the clocks", () => {
  const clip = clips[0];
  assert.equal(momentAt(clip, 0), 0);
  assert.equal(momentAt(clip, clip.release), 1);
  assert.equal(momentAt(clip, clip.moments[2].time), 2);
  assert.equal(evidenceFor(clip)[1].time, clip.release);
  assert.match(evidenceFor(clip)[2].detail, /07:25/);
});
test("both exported reviews roundtrip into existing verified local clips", () => {
  for (const clip of clips) {
    const result = inspectReview(JSON.stringify(reviewPayload(clip)), clips);
    assert.equal(result.status, "ready");
    assert.equal(result.clipId, clip.id);
  }
});
test("malformed and oversized input cannot be opened", () => {
  assert.equal(inspectReview("{broken", clips).status, "invalid");
  assert.equal(
    inspectReview(" ".repeat(MAX_REVIEW_BYTES + 1), clips).status,
    "invalid",
  );
  assert.equal(inspectReview("null", clips).status, "unsupported");
});
test("tracking and note JSON never masquerade as an analyzed review", () => {
  for (const data of [
    { frames: [], fps: 10 },
    { schema: "courtside-personal-notes-v1", notes: [] },
  ])
    assert.equal(
      inspectReview(JSON.stringify(data), clips).status,
      "unsupported",
    );
});
test("unknown clips are blocked even when the schema matches", () => {
  const payload = structuredClone(reviewPayload(clips[0]));
  payload.clip.id = "external";
  const result = inspectReview(JSON.stringify(payload), clips);
  assert.equal(result.status, "unsupported");
  assert.equal(result.clipId, undefined);
});
test("xFG, times, source and media conflicts cannot overwrite verified facts", () => {
  for (const [key, value] of [
    ["xfg", 100],
    ["release", -1],
    ["sourceUrl", "https://example.com"],
    ["video", "https://example.com/video.mp4"],
    ["moments", []],
  ]) {
    const payload = structuredClone(reviewPayload(clips[0]));
    payload.clip[key] = value;
    const result = inspectReview(JSON.stringify(payload), clips);
    assert.equal(result.status, "conflict");
    assert.equal(result.clipId, undefined);
    assert.match(result.checks.at(-1).detail, new RegExp(key));
  }
});
