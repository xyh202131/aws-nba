import test from "node:test";
import assert from "node:assert/strict";
import { createContestCredentials } from "../agent/credentials.ts";

const identity = (expires) => ({
  accessKeyId: "test-only",
  secretAccessKey: "test-only",
  accountId: "414702114718",
  expiration: new Date(expires),
});
test("concurrent requests share valid credentials and refresh the same profile before expiry", async () => {
  let calls = 0,
    now = 0;
  const provider = createContestCredentials(
    async () => {
      calls++;
      return identity(now + 3_600_000);
    },
    () => now,
  );
  const values = await Promise.all([provider(), provider(), provider()]);
  assert.equal(calls, 1);
  assert.equal(values[0], values[1]);
  await provider();
  assert.equal(calls, 1);
  now = 3_350_000;
  await provider();
  assert.equal(calls, 2);
});
test("wrong or missing project identity is rejected; a failed credential lookup requires an explicit next request", async () => {
  for (const accountId of ["405496568869", "wrong", undefined]) {
    const provider = createContestCredentials(
      async () => ({ ...identity(3_600_000), accountId }),
      () => 0,
    );
    await assert.rejects(provider(), (e) => e.code === "PROJECT_BOUNDARY");
  }
  let calls = 0;
  const provider = createContestCredentials(
    async () => {
      calls++;
      if (calls === 1) throw new Error("network unavailable");
      return identity(3_600_000);
    },
    () => 0,
  );
  await assert.rejects(provider());
  assert.equal(calls, 1);
  assert.equal((await provider()).accountId, "414702114718");
  assert.equal(calls, 2);
});
