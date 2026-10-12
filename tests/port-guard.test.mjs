import assert from "node:assert/strict";
import test from "node:test";
import { waitForHttpReady } from "../dist/main/port-guard.js";

test("readiness polling stops promptly when its owner exits", async () => {
  const controller = new AbortController();
  const started = Date.now();
  setTimeout(() => controller.abort(new Error("test canceled")), 30);
  await assert.rejects(waitForHttpReady("http://127.0.0.1:0", 60_000, controller.signal), /test canceled/);
  assert.ok(Date.now() - started < 1_000);
});
