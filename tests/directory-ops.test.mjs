import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { replaceDirectory } from "../dist/main/directory-ops.js";

test("directory replacement preserves the old payload if staging cannot be renamed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "k-agent-replace-"));
  try {
    const destination = path.join(root, "payload");
    await mkdir(destination);
    await writeFile(path.join(destination, "marker.txt"), "old");
    await assert.rejects(replaceDirectory(path.join(root, "missing-staging"), destination));
    assert.equal(await readFile(path.join(destination, "marker.txt"), "utf8"), "old");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("directory replacement installs staging and removes the old backup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "k-agent-replace-"));
  try {
    const destination = path.join(root, "payload");
    const staging = `${destination}.staging`;
    await mkdir(destination);
    await mkdir(staging);
    await writeFile(path.join(destination, "marker.txt"), "old");
    await writeFile(path.join(staging, "marker.txt"), "new");
    await replaceDirectory(staging, destination);
    assert.equal(await readFile(path.join(destination, "marker.txt"), "utf8"), "new");
    await assert.rejects(readFile(`${destination}.backup`, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
