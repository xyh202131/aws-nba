import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import {
  normalizeMatchData,
  alignMatchData,
  DATA_TEMPLATE,
} from "../agent/match-data.ts";
import { planFrames, validateStory, storySchema } from "../agent/story.ts";
import { assText, buildAss } from "../agent/render.ts";
import { probeMedia, fileHash } from "../agent/media.ts";
import { loadConfig, ROOT } from "../agent/config.ts";
import { createAgentServer } from "../agent/server.ts";
import { REQUEST_SCHEMA } from "../shared/agent.ts";
import { dataOverlays } from "../shared/film.ts";

test("data adapters preserve probabilities, milliseconds and untimed records without inventing video time", () => {
  const nba = normalizeMatchData({
    data: {
      playerFirstName: "阿门",
      playerLastName: "汤普森",
      shotList: [
        {
          eventId: 396,
          value: 0.445,
          gameClock: "07:25",
          shotDesc: "急停跳投",
        },
      ],
    },
  });
  assert.equal(nba.events[0].xfgPercent, 44.5);
  assert.equal(nba.events[0].videoTimeSeconds, null);
  const aligned = alignMatchData(
    nba,
    [{ eventId: "396", videoTimeSeconds: 18.0347 }],
    22.89,
  );
  assert.equal(aligned.events[0].videoTimeSeconds, 18.0347);
  const draft = normalizeMatchData(
    {
      clips: [
        {
          clip_id: "one",
          events: [
            {
              event_id: "shot-1",
              video_time_ms: 16000,
              official_metrics: [
                { metric_name: "expected_field_goal_probability", value: 0.51 },
              ],
            },
          ],
        },
      ],
    },
    21,
  );
  assert.equal(draft.events[0].videoTimeSeconds, 16);
  assert.equal(draft.events[0].xfgPercent, 51);
  for (const data of [
    {
      ...DATA_TEMPLATE,
      events: [{ ...DATA_TEMPLATE.events[0], xfgPercent: 101 }],
    },
    {
      ...DATA_TEMPLATE,
      events: [{ ...DATA_TEMPLATE.events[0], videoTimeSeconds: 999 }],
    },
    {
      ...DATA_TEMPLATE,
      events: [DATA_TEMPLATE.events[0], DATA_TEMPLATE.events[0]],
    },
    {
      ...DATA_TEMPLATE,
      events: [
        { ...DATA_TEMPLATE.events[0], sourceUrl: "javascript:alert(1)" },
      ],
    },
    { other: [{ magic: "infer" }] },
  ])
    assert.throws(() => normalizeMatchData(data, 30));
  assert.throws(() =>
    alignMatchData(nba, [{ eventId: "bad", videoTimeSeconds: 1 }], 22),
  );
  assert.throws(() =>
    alignMatchData(nba, [{ eventId: "396", videoTimeSeconds: 22 }], 22),
  );
});

test("story validation binds each commentary segment to its own real frame and data event", () => {
  const data = normalizeMatchData(DATA_TEMPLATE, 22.89);
  const { windows, moments } = planFrames(22.89, data);
  assert.equal(windows.length, 3);
  assert.ok(moments.some((m) => Math.abs(m.time - 18.0347) < 0.001));
  const frames = moments.map((m, i) => ({ id: `frame:${i}`, time: m.time }));
  const schema = storySchema();
  assert.equal(schema.properties.scenes.minItems, 1);
  assert.equal(schema.properties.scenes.maxItems, undefined);
  assert.equal(schema.properties.scenes.items.properties.time.enum, undefined);
  const scenes = windows.map((w) => {
    const f = frames.find((f) => f.time >= w.start && f.time < w.end);
    return {
      text: "球员准备出手，防守者举起手臂。",
      time: f.time,
      evidenceIds: [f.id],
    };
  });
  const cues = validateStory({ scenes }, frames, data, 22.89);
  assert.ok(cues[2].narration.includes("百分之44.5"));
  assert.deepEqual(cues[0].dataEventIds, []);
  assert.deepEqual(cues[2].dataEventIds, ["shot-1"]);
  assert.throws(() =>
    validateStory({ scenes: scenes.slice(0, 1) }, frames, data, 22.89),
  );
  assert.throws(() =>
    validateStory(
      { scenes: scenes.map((s) => ({ ...s, text: "预期命中率90%" })) },
      frames,
      data,
      22.89,
    ),
  );
  const wrong = structuredClone(scenes);
  wrong[0] = scenes[2];
  assert.throws(() => validateStory({ scenes: wrong }, frames, data, 22.89));
  assert.equal(assText("{\\p1}\n输入"), "｛＼p1｝ 输入");
  const ass = buildAss(cues, data, 22.89);
  assert.ok(ass.includes("预期命中率  44.5%"));
  assert.ok(ass.includes("l 134 0 134 8")); // 300 pixels * 44.5%, rounded.
  assert.ok(ass.includes("上传数据 · 来源待核验"));
  const multiple = structuredClone(data);
  multiple.events.push({
    ...data.events[0],
    id: "other",
    videoTimeSeconds: 20,
  });
  const overlays = dataOverlays(multiple, 22.89);
  assert.equal(overlays[0].end, overlays[1].start);
  assert.ok(overlays.every((o) => o.end > o.start));
});

test(
  "arbitrary uploaded video plus aligned NBA JSON produces a narrated MP4, subtitles, timeline and seekable HTTP bytes",
  { timeout: 180_000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "courtside-film-test-"));
    const config = loadConfig({ AGENT_DATA_DIR: directory });
    const { server, manager } = await createAgentServer(config);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
      await manager.settled();
      await new Promise((resolve) => server.close(resolve));
      assert.ok(
        resolve(directory).startsWith(
          resolve(tmpdir()) + sep + "courtside-film-test-",
        ),
      );
      await rm(directory, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async (path, data) =>
      fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    const invalid = await fetch(base + "/api/media", {
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
      body: "not a movie",
    });
    assert.equal(invalid.status, 400);
    assert.equal((await readdir(join(directory, "uploads"))).length, 0);
    const playlist = await fetch(base + "/api/media", {
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
      body: "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nhttp://127.0.0.1:1/private\n#EXT-X-ENDLIST",
    });
    assert.equal(playlist.status, 400);
    assert.equal((await readdir(join(directory, "uploads"))).length, 0);
    const bytes = await readFile(join(ROOT, "public/media/amen.mp4"));
    const uploadResponse = await fetch(base + "/api/media", {
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
      body: bytes,
    });
    assert.equal(uploadResponse.status, 201);
    const upload = await uploadResponse.json();
    assert.ok(upload.duration > 22 && upload.hasAudio);
    const rawData = {
      data: {
        shotList: [
          {
            eventId: 396,
            value: 0.445,
            shotDesc: "急停跳投",
            gameClock: "07:25",
          },
          { eventId: 99, value: 0.9, shotDesc: "未对齐档案" },
        ],
      },
    };
    const badRegistration = await post("/api/materials", {
      uploadId: upload.id,
      data: rawData,
    });
    assert.equal(badRegistration.status, 400);
    assert.equal(
      (await badRegistration.json()).error.code,
      "DATA_ALIGNMENT_REQUIRED",
    );
    const materialResponse = await post("/api/materials", {
      uploadId: upload.id,
      title: "新输入回合",
      data: rawData,
      alignments: [{ eventId: "396", videoTimeSeconds: 18.0347 }],
    });
    assert.equal(materialResponse.status, 201);
    const material = await materialResponse.json();
    assert.match(material.id, /^[a-f0-9-]{36}$/);
    const createdResponse = await post("/api/jobs", {
      schemaVersion: REQUEST_SCHEMA,
      clipId: material.id,
      executionMode: "fixture",
      outputMode: "film",
    });
    assert.equal(createdResponse.status, 202);
    const created = await createdResponse.json();
    await manager.settled();
    const job = manager.get(created.id);
    assert.equal(job.status, "completed", JSON.stringify(job.error));
    const film = job.result.film;
    assert.equal(job.result.usage.modelCalls, 0);
    assert.equal(job.result.official, null);
    assert.equal(film.cues.length, 3);
    assert.equal(film.data.events.length, 2);
    assert.ok(film.bytes > 100_000);
    const path = join(directory, "artifacts", job.id, "film.mp4");
    assert.equal(await fileHash(path), film.sha256);
    const info = await probeMedia(path, config);
    assert.equal(info.hasAudio, true);
    assert.ok(Math.abs(info.duration - upload.duration) < 0.1);
    const ass = await readFile(
      join(directory, "artifacts", job.id, "captions.ass"),
      "utf8",
    );
    assert.ok(!ass.includes("90%")); // Untimed metric must not be shown in the film.
    const voice = await readFile(
      join(directory, "artifacts", job.id, "voice-0.wav"),
    );
    assert.ok(
      voice.length > 1000 && voice.subarray(100).some((byte) => byte !== 0),
    );
    const range = await fetch(base + film.video, {
      headers: { Range: "bytes=0-1023" },
    });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 1024);
    assert.match(range.headers.get("Content-Range"), /^bytes 0-1023\//);
    const suffix = await fetch(base + film.video, {
      headers: { Range: "bytes=-100" },
    });
    assert.equal(suffix.status, 206);
    assert.equal((await suffix.arrayBuffer()).byteLength, 100);
    const invalidRange = await fetch(base + film.video, {
      headers: { Range: "bytes=999999999-" },
    });
    assert.equal(invalidRange.status, 416);
    const caption = await fetch(base + film.captions);
    assert.ok((await caption.text()).startsWith("WEBVTT"));
    const timeline = await (await fetch(base + film.timeline)).json();
    assert.equal(timeline.cues[2].dataEventIds[0], "396");
  },
);
