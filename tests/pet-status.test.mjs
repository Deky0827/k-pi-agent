import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { newestSessionFile } from "../dist/main/session-scan.js";

test("pet watcher selects the newest JSONL across session folders", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "k-pi-pet-test-"));
  try {
    const older = path.join(root, "project-a", "older.jsonl");
    const newer = path.join(root, "project-b", "newer.jsonl");
    await mkdir(path.dirname(older), { recursive: true });
    await mkdir(path.dirname(newer), { recursive: true });
    await writeFile(older, "{}\n");
    await writeFile(newer, "{}\n");
    await utimes(older, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
    await utimes(newer, new Date(1_800_000_000_000), new Date(1_800_000_000_000));
    assert.equal((await newestSessionFile(root))?.file, newer);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
