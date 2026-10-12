import type { KAgentSettings, PetManifest, ThemeManifest } from "./store.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function has(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function recordField(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`设置字段 ${key} 必须是对象。`);
  return value;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`设置字段 ${name} 必须是有限数字。`);
  return Math.min(max, Math.max(min, value));
}

function nullableId(value: unknown, fallback: string | null, name: string): string | null {
  if (value === undefined) return fallback;
  if (value === null || (typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value))) return value;
  throw new Error(`设置字段 ${name} 的 id 无效。`);
}

function position(value: unknown, fallback: number | null, name: string): number | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`设置字段 ${name} 必须是有限数字或 null。`);
  return Math.max(-100_000, Math.min(100_000, value));
}

export function normalizeSettings(value: unknown, base: KAgentSettings): KAgentSettings {
  if (!isRecord(value)) throw new Error("设置必须是 JSON 对象。");
  const pet = has(value, "pet") ? recordField(value, "pet") : {};
  const theme = has(value, "theme") ? recordField(value, "theme") : {};
  const ui = has(value, "ui") ? recordField(value, "ui") : {};

  const enabled = pet.enabled === undefined ? base.pet.enabled : pet.enabled;
  if (typeof enabled !== "boolean") throw new Error("设置字段 pet.enabled 必须是布尔值。");
  const mode = theme.mode === undefined ? base.theme.mode : theme.mode;
  if (mode !== "system" && mode !== "light" && mode !== "dark") throw new Error("设置字段 theme.mode 无效。");
  const customCss = ui.customCss === undefined ? base.ui.customCss : ui.customCss;
  if (typeof customCss !== "string" || customCss.length > 100_000) throw new Error("自定义 CSS 必须是 100,000 个字符以内的文本。");

  let removedBundledPets = base.removedBundledPets;
  if (value.removedBundledPets !== undefined) {
    if (!Array.isArray(value.removedBundledPets) || value.removedBundledPets.length > 256 ||
      value.removedBundledPets.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(id))) {
      throw new Error("设置字段 removedBundledPets 必须是最多 256 个有效 id 的数组。");
    }
    removedBundledPets = [...new Set(value.removedBundledPets as string[])];
  }

  return {
    pet: {
      enabled,
      activePetId: nullableId(pet.activePetId, base.pet.activePetId, "pet.activePetId"),
      scale: boundedNumber(pet.scale, base.pet.scale, 0.4, 2, "pet.scale"),
      x: position(pet.x, base.pet.x, "pet.x"),
      y: position(pet.y, base.pet.y, "pet.y")
    },
    theme: {
      mode,
      activeThemeId: nullableId(theme.activeThemeId, base.theme.activeThemeId, "theme.activeThemeId")
    },
    ui: {
      zoom: boundedNumber(ui.zoom, base.ui.zoom, 0.8, 1.4, "ui.zoom"),
      customCss
    },
    removedBundledPets
  };
}

function optionalText(value: unknown, maxLength: number): boolean {
  return value === undefined || (typeof value === "string" && value.length <= maxLength);
}

export function isPetManifest(value: unknown): value is PetManifest {
  if (!isRecord(value) || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value.id) ||
    typeof value.name !== "string" || !value.name.trim() || value.name.length > 120 ||
    !optionalText(value.author, 120) || !optionalText(value.version, 80) || !optionalText(value.description, 2_000) ||
    !Number.isInteger(value.frameSize) || (value.frameSize as number) < 1 || (value.frameSize as number) > 2_048 ||
    !Number.isInteger(value.columns) || (value.columns as number) < 1 || (value.columns as number) > 128 ||
    !isRecord(value.states) || !Object.keys(value.states).length || Object.keys(value.states).length > 64 ||
    (value.defaultState !== undefined && typeof value.defaultState !== "string") ||
    (value.pixelated !== undefined && typeof value.pixelated !== "boolean") ||
    (value.reactions !== undefined && (!Array.isArray(value.reactions) || value.reactions.length > 32 ||
      value.reactions.some((item) => typeof item !== "string" || item.length > 200)))) return false;

  if (value.defaultState && !Object.prototype.hasOwnProperty.call(value.states, value.defaultState)) return false;
  return Object.entries(value.states).every(([name, state]) => {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name) || !isRecord(state) ||
      !Array.isArray(state.frames) || !state.frames.length || state.frames.length > 1_024 ||
      state.frames.some((frame) => !Number.isInteger(frame) || (frame as number) < 0) ||
      typeof state.fps !== "number" || !Number.isFinite(state.fps) || state.fps < 1 || state.fps > 30) return false;
    return true;
  });
}

export function isThemeManifest(value: unknown): value is ThemeManifest {
  return isRecord(value) && typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value.id) &&
    typeof value.name === "string" && Boolean(value.name.trim()) && value.name.length <= 120 &&
    optionalText(value.author, 120) && optionalText(value.version, 80) && optionalText(value.description, 2_000);
}

export interface ZipEntryLimitInfo {
  name: string;
  isDirectory: boolean;
  size: number;
  compressedSize: number;
  isSymlink: boolean;
}

export const MAX_RESOURCE_ZIP_BYTES = 128 * 1024 * 1024;
export const MAX_RESOURCE_ZIP_FILES = 256;
export const MAX_RESOURCE_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_RESOURCE_TOTAL_BYTES = 128 * 1024 * 1024;
export const MAX_RESOURCE_MANIFEST_BYTES = 1024 * 1024;
export const MAX_RESOURCE_PREVIEW_BYTES = 8 * 1024 * 1024;

export function assertResourceZipSize(archiveSize: number): void {
  if (!Number.isSafeInteger(archiveSize) || archiveSize < 1 || archiveSize > MAX_RESOURCE_ZIP_BYTES) {
    throw new Error("资源 ZIP 不能超过 128 MiB。");
  }
}

export function normalizeZipEntryPath(raw: string, isDirectory: boolean): string {
  const unified = raw.replace(/\\/g, "/");
  if (!unified || /^[a-zA-Z]:/.test(unified) || unified.startsWith("/") || /[\u0000-\u001f:]/.test(unified)) {
    throw new Error(`压缩包包含非法路径：${raw}`);
  }
  const parts = unified.split("/");
  if (isDirectory && parts.at(-1) === "") parts.pop();
  if (!parts.length || parts.some((part) => !part || part === "." || part === ".." || part.endsWith(".") || part.endsWith(" ") ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`压缩包包含非法路径：${raw}`);
  }
  return parts.join("/");
}

export function assertResourceZipLimits(archiveSize: number, entries: ZipEntryLimitInfo[]): void {
  assertResourceZipSize(archiveSize);
  if (!entries.length || entries.length > MAX_RESOURCE_ZIP_FILES) throw new Error("资源 ZIP 最多允许 256 个文件或目录项。");
  let total = 0;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.size) || !Number.isSafeInteger(entry.compressedSize) ||
      entry.size < 0 || entry.compressedSize < 0 || entry.size > MAX_RESOURCE_FILE_BYTES || entry.isSymlink) {
      throw new Error(`资源 ZIP 中存在过大或不支持的文件：${entry.name}`);
    }
    if (!entry.isDirectory) total += entry.size;
    if (total > MAX_RESOURCE_TOTAL_BYTES) throw new Error("资源 ZIP 解压后的总大小不能超过 128 MiB。");
  }
}
