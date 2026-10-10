import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { loadConfig } from "../agent/config.ts";
import { parseRequest, validateObservation } from "../agent/contracts.ts";
import { REQUEST_SCHEMA } from "../shared/agent.ts";
import { analyze } from "../agent/providers.ts";
import { JobManager } from "../agent/jobs.ts";
import { AgentError } from "../agent/errors.ts";
import { createAgentServer } from "../agent/server.ts";
import { adaptOfficialRequest } from "../agent/official-adapter.ts";

const req = (clipId = "train_002") => ({
  schemaVersion: REQUEST_SCHEMA,
  clipId,
});
const tempConfig = async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "courtside-agent-test-"));
  t.after(() => {
    assert.ok(
      resolve(directory).startsWith(
        resolve(tmpdir()) + sep + "courtside-agent-test-",
      ),
    );
    return rm(directory, { recursive: true, force: true });
  });
  return loadConfig({ AGENT_DATA_DIR: directory });
};
test("contest region/profile and paid-call gates reject unsafe configuration", () => {
  assert.equal(loadConfig({}).provider, "fixture");
  assert.equal(loadConfig({}).profile, "nba");
  assert.equal(loadConfig({}).region, "us-east-1");
  assert.equal(
    loadConfig({ AGENT_PROVIDER: "bedrock", ALLOW_PAID_MODEL_CALLS: "true" })
      .modelId,
    "global.anthropic.claude-sonnet-4-6",
  );
  for (const env of [
    { AWS_PROFILE: "default" },
    { AWS_PROFILE: "Team11" },
    { AWS_REGION: "us-east-2" },
    { AWS_PROFILE: "aws-personal" },
    { AGENT_PROVIDER: "bedrock" },
    {
      AGENT_PROVIDER: "bedrock",
      ALLOW_PAID_MODEL_CALLS: "true",
      BEDROCK_MODEL_ID: "us.anthropic.claude-sonnet-4-6",
    },
    { AGENT_HOST: "0.0.0.0" },
  ])
    assert.throws(() => loadConfig(env));
});
test("requests reject path injection, remote URLs, unsupported schemas and extra fields", () => {
  assert.deepEqual(parseRequest(req()), req());
  for (const input of [
    null,
    [],
    req("../../secrets"),
    req("https://example.com/video"),
    { ...req(), schemaVersion: "official" },
    { ...req(), modelId: "anything" },
  ])
    assert.throws(() => parseRequest(input));
  assert.throws(() => adaptOfficialRequest(req()), /官方/);
});
test("model output cannot replace official metrics or cite invented/off-time frames", () => {
  const frames = [{ id: "frame-1", time: 10 }];
  const valid = { text: "球员正在出手。", time: 10, evidenceIds: ["frame-1"] };
  assert.deepEqual(validateObservation(valid, 20, frames), valid);
  for (const invalid of [
    { ...valid, xfg: 99 },
    { ...valid, time: 21 },
    { ...valid, time: NaN },
    { ...valid, evidenceIds: ["invented"] },
    { ...valid, time: 1 },
    { ...valid, evidenceIds: [] },
    { ...valid, text: "" },
  ])
    assert.throws(() => validateObservation(invalid, 20, frames));
});
test("Bedrock provider rejects disabled calls before constructing a client", async () => {
  await assert.rejects(
    analyze({}, [], "test", { ...loadConfig({}), provider: "bedrock" }),
    (error) => error.code === "PAID_CALLS_DISABLED",
  );
});
test("real video pipeline extracts evidence, preserves provenance, persists and restores both fixture jobs", async (t) => {
  const config = await tempConfig(t);
  const manager = new JobManager(config);
  await manager.initialize();
  for (const clipId of ["train_001", "train_002"]) {
    const job = await manager.create(req(clipId));
    await manager.settled();
    assert.equal(job.status, "completed", JSON.stringify(job.error));
    assert.equal(job.result.provider, "fixture");
    assert.equal(job.result.usage.modelCalls, 0);
    assert.equal(job.result.reviewStatus, "fixture_replay");
    assert.equal(
      job.result.official.xfgPercent,
      clipId === "train_001" ? 51 : 44.5,
    );
    assert.equal(job.result.frames.length, 3);
    for (const [index, frame] of job.result.frames.entries()) {
      assert.ok(Math.abs(frame.time - frame.requestedTime) < 0.15);
      assert.match(frame.sha256, /^[a-f0-9]{64}$/);
      const jpeg = await readFile(
        join(config.dataDir, "frames", job.id, `${index}.jpg`),
      );
      assert.equal(jpeg[0], 255);
      assert.equal(jpeg[1], 216);
    }
    assert.notEqual(
      job.result.media.originalSha256,
      job.result.media.previewSha256,
    );
  }
  const restored = new JobManager(config);
  await restored.initialize();
  assert.equal(restored.list().length, 2);
  assert.ok(restored.list().every((job) => job.status === "completed"));
});
test("failure is durable and interrupted jobs are not automatically retried", async (t) => {
  const config = await tempConfig(t);
  const manager = new JobManager(config, async (_req, _id, _config, stage) => {
    await stage("frames");
    throw new AgentError("TEST_FAILURE", "解码失败", 500);
  });
  await manager.initialize();
  const job = await manager.create(req());
  await manager.settled();
  assert.equal(job.status, "failed");
  assert.equal(job.result, undefined);
  assert.equal(job.error.code, "TEST_FAILURE");
  const stored = JSON.parse(
    await readFile(join(config.dataDir, "jobs", `${job.id}.json`), "utf8"),
  );
  stored.status = "running";
  await writeFile(
    join(config.dataDir, "jobs", `${job.id}.json`),
    JSON.stringify(stored),
  );
  const restored = new JobManager(config);
  await restored.initialize();
  assert.equal(restored.get(job.id).error.code, "PROCESS_INTERRUPTED");
});

test("concurrent submissions cannot bypass queue cap and jobs run serially", async (t) => {
  const config = await tempConfig(t);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let active = 0;
  let peak = 0;
  const manager = new JobManager(config, async () => {
    active++;
    peak = Math.max(peak, active);
    await gate;
    active--;
    throw new AgentError("TEST_FAILURE", "测试队列继续执行", 500);
  });
  await manager.initialize();
  const requests = await Promise.allSettled(
    Array.from({ length: 5 }, () => manager.create(req())),
  );
  assert.equal(requests.filter((r) => r.status === "fulfilled").length, 4);
  assert.equal(
    requests.find((r) => r.status === "rejected").reason.code,
    "QUEUE_FULL",
  );
  release();
  await manager.settled();
  assert.equal(peak, 1);
  assert.ok(manager.list().every((job) => job.status === "failed"));
});

test("stale offline browser request cannot invoke a paid provider", async (t) => {
  const config = {
    ...(await tempConfig(t)),
    provider: "bedrock",
    paidCallsEnabled: true,
  };
  let calls = 0;
  const manager = new JobManager(config, async () => {
    calls++;
    throw new Error("Must not run");
  });
  const { server } = await createAgentServer(config, manager);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/jobs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req()),
    },
  );
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
  assert.equal(manager.list().length, 0);
});
test("explicit Bedrock browser request is accepted only by enabled paid backend", async (t) => {
  const config = {
    ...(await tempConfig(t)),
    provider: "bedrock",
    paidCallsEnabled: true,
  };
  let calls = 0;
  const manager = new JobManager(config, async () => {
    calls++;
    throw new AgentError("TEST_FAILURE", "测试调用", 500);
  });
  const { server } = await createAgentServer(config, manager);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await manager.settled();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...req(), executionMode: "bedrock" }),
  });
  assert.equal(response.status, 202);
  await manager.settled();
  assert.equal(calls, 1);
  assert.equal(
    (await (await fetch(`${base}/api/health`)).json()).modelId,
    config.modelId,
  );
});
test("HTTP health, validation, origin protection, official guard and async job APIs", async (t) => {
  const config = await tempConfig(t);
  const manager = new JobManager(config, async () => {
    throw new AgentError("TEST_FAILURE", "测试失败", 500);
  });
  const { server } = await createAgentServer(config, manager);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await manager.settled();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const ping = await fetch(`${base}/ping`);
  assert.equal(ping.status, 200);
  assert.equal((await ping.json()).paidCallsEnabled, false);
  assert.equal(
    (
      await fetch(`${base}/api/jobs`, {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const post = (path, payload) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  assert.equal((await post("/invocations", req("bad"))).status, 400);
  assert.equal((await post("/official/invocations", req())).status, 501);
  assert.equal(
    (await post("/api/jobs", { value: "x".repeat(17_000) })).status,
    413,
  );
  const response = await post("/api/jobs", req());
  assert.equal(response.status, 202);
  const job = await response.json();
  await manager.settled();
  const detail = await fetch(`${base}/api/jobs/${job.id}`);
  assert.equal((await detail.json()).status, "failed");
  assert.equal((await fetch(`${base}/api/jobs/${job.id}/result`)).status, 409);
});
