import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions } from "../dist/main/semver.js";

test("compares ordinary release versions", () => {
  assert.equal(compareVersions("0.8.11", "0.8.11"), 0);
  assert.equal(compareVersions("0.8.12", "0.8.11"), 1);
  assert.equal(compareVersions("v22.19.0", "22.23.2"), -1);
});

test("rejects non-release versions", () => {
  assert.throws(() => compareVersions("latest", "0.1.0"));
});
