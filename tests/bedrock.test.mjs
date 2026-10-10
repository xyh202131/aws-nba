import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { analyze, buildAnalysisRequest } from "../agent/providers.ts";
import { loadConfig } from "../agent/config.ts";
import { JobManager } from "../agent/jobs.ts";
import { REQUEST_SCHEMA } from "../shared/agent.ts";

const frames = [0, 1, 2].map((n) => ({
  id: `test:frame:${n}`,
  time: 10 + n,
  requestedTime: 10 + n,
  sha256: "test",
  image: "test",
}));
const response = (text, stopReason = "end_turn") => ({
  output: { message: { role: "assistant", content: [{ text }] } },
  stopReason,
  usage: { inputTokens: 2000, outputTokens: 100, totalTokens: 2100 },
  metrics: { latencyMs: 120 },
  $metadata: {},
});
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), "courtside-bedrock-test-"));
  t.after(() => {
    assert.ok(
      resolve(directory).startsWith(
        resolve(tmpdir()) + sep + "courtside-bedrock-test-",
      ),
    );
    return rm(directory, { recursive: true, force: true });
  });
  return loadConfig({
    AGENT_PROVIDER: "bedrock",
    ALLOW_PAID_MODEL_CALLS: "true",
    AGENT_DATA_DIR: directory,
  });
}
async function writeFrames(config, id) {
  const folder = join(config.dataDir, "frames", id);
  await mkdir(folder, { recursive: true });
  for (let n = 0; n < 3; n++)
    await writeFile(
      join(folder, `${n}.jpg`),
      Buffer.from([255, 216, n, 255, 217]),
    );
}
test("Sonnet schema constrains evidence/time; Qwen uses its verified basic API", async (t) => {
  const config = await setup(t);
  await writeFrames(config, "test");
  const input = await buildAnalysisRequest(frames, "test", config);
  const schema = JSON.parse(
    input.outputConfig.textFormat.structure.jsonSchema.schema,
  );
  assert.equal(input.inferenceConfig.maxTokens, 1000);
  assert.deepEqual(schema.properties.time.enum, [11]);
  assert.deepEqual(schema.properties.evidenceIds.items.enum, ["test:frame:1"]);
  assert.equal(input.messages[0].content.filter((c) => c.image).length, 3);
  const qwen = await buildAnalysisRequest(frames, "test", {
    ...config,
    modelId: "qwen.qwen3-vl-235b-a22b",
  });
  assert.equal(qwen.outputConfig, undefined);
});
test("invalid JSON preserves charged response and usage durably through restart", async (t) => {
  const config = await setup(t);
  let calls = 0;
  const manager = new JobManager(
    config,
    async (_request, id, cfg, stage, record) => {
      await stage("analysis");
      await writeFrames(cfg, id);
      return analyze({}, frames, id, cfg, record, async () => {
        calls++;
        return response("```json\n[]\n```");
      });
    },
  );
  await manager.initialize();
  const job = await manager.create({
    schemaVersion: REQUEST_SCHEMA,
    clipId: "train_002",
    executionMode: "bedrock",
  });
  await manager.settled();
  assert.equal(calls, 1);
  assert.equal(job.status, "failed");
  assert.equal(job.error.code, "INVALID_MODEL_OUTPUT");
  assert.equal(job.invocation.usage.inputTokens, 2000);
  assert.equal(job.invocation.usage.estimatedUsd, 0.0075);
  assert.match(job.invocation.rawText, /^```json/);
  const stored = JSON.parse(
    await readFile(join(config.dataDir, "jobs", job.id + ".json"), "utf8"),
  );
  assert.deepEqual(stored.invocation, job.invocation);
  const restarted = new JobManager(config);
  await restarted.initialize();
  assert.deepEqual(restarted.get(job.id).invocation, job.invocation);
  assert.equal(calls, 1);
});
test("timeout or denied response has unknown usage and no implicit retry", async (t) => {
  const config = await setup(t);
  await writeFrames(config, "test");
  const records = [];
  let calls = 0;
  await assert.rejects(
    analyze(
      {},
      frames,
      "test",
      config,
      async (value) => records.push(value),
      async () => {
        calls++;
        const error = new Error("do not expose raw error");
        error.name = "AccessDeniedException";
        throw error;
      },
    ),
    (error) => error.code === "AccessDeniedException",
  );
  assert.equal(calls, 1);
  assert.equal(records[0].status, "started");
  assert.equal(records[1].status, "failed");
  assert.equal(records[1].usage.inputTokens, null);
  assert.equal(records[1].usage.estimatedUsd, null);
  assert.equal(records[1].rawText, "");
});
test("truncated output is rejected after recording its real usage", async (t) => {
  const config = await setup(t);
  await writeFrames(config, "test");
  const records = [];
  await assert.rejects(
    analyze(
      {},
      frames,
      "test",
      config,
      async (value) => records.push(value),
      async () => response('{"text":', "max_tokens"),
    ),
    (error) => error.code === "INVALID_MODEL_OUTPUT",
  );
  assert.equal(records[1].stopReason, "max_tokens");
  assert.equal(records[1].usage.outputTokens, 100);
});
test("failed attempt persistence prevents any model request", async (t) => {
  const config = await setup(t);
  await writeFrames(config, "test");
  let calls = 0;
  await assert.rejects(
    analyze(
      {},
      frames,
      "test",
      config,
      async () => {
        throw new Error("disk unavailable");
      },
      async () => {
        calls++;
        return response("{}");
      },
    ),
    /disk unavailable/,
  );
  assert.equal(calls, 0);
});
