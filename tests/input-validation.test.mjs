import assert from "node:assert/strict";
import test from "node:test";
import {
  assertResourceZipLimits,
  assertResourceZipSize,
  isPetManifest,
  normalizeSettings,
  normalizeZipEntryPath
} from "../dist/main/input-validation.js";

const defaults = {
  pet: { enabled: false, activePetId: null, scale: 1.2, x: null, y: null },
  theme: { mode: "system", activeThemeId: null },
  ui: { zoom: 1, customCss: "" },
  removedBundledPets: []
};

test("settings patches clamp ranges and drop unknown fields", () => {
  const settings = normalizeSettings({ pet: { scale: 9 }, ui: { zoom: 0.1 }, extra: { secret: true } }, defaults);
  assert.equal(settings.pet.scale, 2);
  assert.equal(settings.ui.zoom, 0.8);
  assert.equal("extra" in settings, false);
  assert.throws(() => normalizeSettings({ pet: { enabled: "yes" } }, defaults), /布尔值/);
});

test("ZIP paths reject traversal, absolute paths and Windows device names", () => {
  assert.equal(normalizeZipEntryPath("kitty\\pet.json", false), "kitty/pet.json");
  for (const name of ["../outside", "kitty/a/../../outside", "C:/outside", "\\\\server\\share", "NUL.txt"]) {
    assert.throws(() => normalizeZipEntryPath(name, false), name);
  }
});

test("resource ZIP limits reject excessive entries, expansion and symlinks", () => {
  assert.throws(() => assertResourceZipSize(129 * 1024 * 1024), /128 MiB/);
  assert.throws(() => assertResourceZipLimits(10, Array.from({ length: 257 }, (_, i) => ({
    name: `${i}`, isDirectory: true, size: 0, compressedSize: 0, isSymlink: false
  }))), /256/);
  assert.throws(() => assertResourceZipLimits(10, [{
    name: "large", isDirectory: false, size: 65 * 1024 * 1024, compressedSize: 10, isSymlink: false
  }]), /过大/);
  assert.throws(() => assertResourceZipLimits(10, [{
    name: "link", isDirectory: false, size: 0, compressedSize: 0, isSymlink: true
  }]), /过大/);
});

test("pet manifests require usable animation states", () => {
  const manifest = {
    id: "kitty", name: "Kitty", frameSize: 128, columns: 8,
    defaultState: "idle", states: { idle: { frames: [0, 1], fps: 3 } }
  };
  assert.equal(isPetManifest(manifest), true);
  assert.equal(isPetManifest({ ...manifest, defaultState: "missing" }), false);
  assert.equal(isPetManifest({ ...manifest, states: { idle: { frames: [-1], fps: 3 } } }), false);
});
