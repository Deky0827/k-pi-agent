import { app, dialog, ipcMain, shell } from "electron";
import AdmZip from "adm-zip";
import { copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveNetworkEnvironment } from "./network.js";
import { assertResourceZipLimits, assertResourceZipSize, isPetManifest, isThemeManifest, normalizeSettings, normalizeZipEntryPath,
  MAX_RESOURCE_MANIFEST_BYTES, MAX_RESOURCE_PREVIEW_BYTES } from "./input-validation.js";
import { bundledPetsRoot, isCopyTargetAlreadyPresent, replaceDirectory, writeJsonAtomic } from "./paths.js";

/**
 * Pluggable pet & theme resource framework.
 * - Pets live in  <userData>/pets/<id>/  with pet.json + spritesheet.png
 * - Themes live in <userData>/themes/<id>/  with theme.json + theme.css
 * - Bundled pets ship in resources/seed-pets and are copied in on first run.
 * The framework itself ships empty; resources are installed as zip packages
 * (via the settings UI) or by dropping folders into the directories above.
 */

export interface PetStateDef {
  frames: number[];
  fps: number;
}

export interface PetManifest {
  id: string;
  name: string;
  author?: string;
  version?: string;
  description?: string;
  frameSize: number;
  columns: number;
  defaultState?: string;
  states: Record<string, PetStateDef>;
  /** Optional speech bubbles shown when the user clicks the pet. */
  /** Render with nearest-neighbor upscaling (pixel-art resources). */
  pixelated?: boolean;
  reactions?: string[];
}

export interface ThemeManifest {
  id: string;
  name: string;
  author?: string;
  version?: string;
  description?: string;
}

export interface KAgentSettings {
  pet: {
    enabled: boolean;
    activePetId: string | null;
    scale: number;
    x: number | null;
    y: number | null;
  };
  theme: {
    mode: "system" | "light" | "dark";
    activeThemeId: string | null;
  };
  ui: {
    zoom: number;
    customCss: string;
  };
  removedBundledPets: string[];
}

export const DEFAULT_SETTINGS: KAgentSettings = {
  pet: { enabled: false, activePetId: null, scale: 1.2, x: null, y: null },
  theme: { mode: "system", activeThemeId: null },
  ui: { zoom: 1, customCss: "" },
  removedBundledPets: []
};

const SETTINGS_FILE = "settings.json";

/** The pinned userData directory (main.ts pins it to %APPDATA%\pi-desktop before ready). */
function userDataRootFor(): string {
  return app.getPath("userData");
}

function settingsFile(): string {
  return path.join(userDataRootFor(), SETTINGS_FILE);
}

let cached: KAgentSettings | undefined;
let settingsWarning: string | undefined;
const changeListeners = new Set<(settings: KAgentSettings) => void>();

export function onSettingsChanged(listener: (settings: KAgentSettings) => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export async function getSettings(): Promise<KAgentSettings> {
  if (cached) return cached;
  let text: string | undefined;
  try {
    text = await readFile(settingsFile(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (text === undefined) {
    cached = DEFAULT_SETTINGS;
    return cached;
  }
  try {
    cached = normalizeSettings(JSON.parse(text), DEFAULT_SETTINGS);
  } catch (error) {
    const backup = `${settingsFile()}.corrupt-${Date.now()}-${process.pid}.bak`;
    try {
      await copyFile(settingsFile(), backup);
    } catch (backupError) {
      throw new Error(`设置文件无法读取，且无法创建备份：${backup}. ${backupError instanceof Error ? backupError.message : String(backupError)}`);
    }
    settingsWarning = `原文件已保留在：${backup}\n原因：${error instanceof Error ? error.message : String(error)}`;
    cached = DEFAULT_SETTINGS;
  }
  return cached;
}

export function getSettingsWarning(): string | undefined {
  return settingsWarning;
}

export async function setSettings(patch: unknown): Promise<KAgentSettings> {
  const current = await getSettings();
  cached = normalizeSettings(patch, current);
  await mkdir(userDataRootFor(), { recursive: true });
  await writeJsonAtomic(settingsFile(), cached);
  for (const listener of changeListeners) {
    listener(cached);
  }
  return cached;
}

/* ---------------- resources ---------------- */

function safeId(value: unknown): string | null {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) return null;
  return value;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function fileToDataUrl(file: string, mime: string): Promise<string | null> {
  try {
    const bytes = await readFile(file);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Copies bundled seed pets into <userData>/pets unless removed by the user. */
export async function syncBundledPets(): Promise<void> {
  const settings = await getSettings();
  const bundled = bundledPetsRoot();
  let entries: string[] = [];
  try {
    entries = await readdir(bundled);
  } catch {
    return; // no bundled pets in this build
  }
  await mkdir(path.join(userDataRootFor(), "pets"), { recursive: true });
  for (const dir of entries) {
    const manifest = await readJson<PetManifest>(path.join(bundled, dir, "pet.json"));
    if (!manifest?.id || settings.removedBundledPets.includes(manifest.id)) continue;
    const destination = path.join(userDataRootFor(), "pets", manifest.id);
    // Skip only when the copy is COMPLETE. An interrupted earlier copy (force-killed
    // app, power loss) leaves an empty/partial dir behind; with errorOnExist semantics
    // that dir would then shadow the bundled pet forever (silent empty-pet bug).
    const [destManifest, sheetStat] = await Promise.all([
      readJson<PetManifest>(path.join(destination, "pet.json")),
      stat(path.join(destination, "spritesheet.png")).catch(() => null)
    ]);
    if (destManifest?.id && sheetStat && sheetStat.size > 0) continue;
    await cp(path.join(bundled, dir), destination, { recursive: true, force: true });
  }
}

export interface PetInfo {
  id: string;
  manifest: PetManifest;
  previewDataUrl: string | null;
}

export async function listPets(): Promise<PetInfo[]> {
  const root = path.join(userDataRootFor(), "pets");
  let dirs: string[] = [];
  try {
    dirs = await readdir(root);
  } catch {
    return [];
  }
  const pets: PetInfo[] = [];
  for (const dir of dirs) {
    const manifest = await readJson<PetManifest>(path.join(root, dir, "pet.json"));
    if (!manifest?.id || !manifest.frameSize || !manifest.columns || !manifest.states) continue;
    pets.push({
      id: manifest.id,
      manifest,
      previewDataUrl: await fileToDataUrl(path.join(root, dir, "preview.png"), "image/png")
    });
  }
  return pets.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name, "zh-Hans-CN"));
}

export interface ThemeInfo {
  id: string;
  manifest: ThemeManifest;
}

export async function listThemes(): Promise<ThemeInfo[]> {
  const root = path.join(userDataRootFor(), "themes");
  let dirs: string[] = [];
  try {
    dirs = await readdir(root);
  } catch {
    return [];
  }
  const themes: ThemeInfo[] = [];
  for (const dir of dirs) {
    const manifest = await readJson<ThemeManifest>(path.join(root, dir, "theme.json"));
    if (!manifest?.id) continue;
    themes.push({ id: manifest.id, manifest });
  }
  return themes.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name, "zh-Hans-CN"));
}

/** Extracts a zip whose root (or single subfolder) contains pet.json + spritesheet. */
export async function installResourceFromZip(kind: "pet" | "theme"): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const result = await dialog.showOpenDialog({
    title: kind === "pet" ? "安装桌宠资源包（.zip）" : "安装主题资源包（.zip）",
    filters: [{ name: "资源包", extensions: ["zip"] }],
    properties: ["openFile"]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, error: "已取消" };
  const zipPath = result.filePaths[0];
  try {
    const archiveStat = await stat(zipPath);
    assertResourceZipSize(archiveStat.size);
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    assertResourceZipLimits(archiveStat.size, zipEntries.map((entry) => ({
      name: entry.entryName,
      isDirectory: entry.isDirectory,
      size: entry.header.size,
      compressedSize: entry.header.compressedSize,
      isSymlink: ((entry.attr >>> 16) & 0xf000) === 0xa000
    })));

    const normalized = zipEntries.map((entry) => ({ entry, name: normalizeZipEntryPath(entry.entryName, entry.isDirectory) }));
    const seen = new Set<string>();
    for (const item of normalized) {
      const key = item.name.toLocaleLowerCase("en-US");
      if (seen.has(key)) throw new Error(`压缩包包含重复路径：${item.name}`);
      seen.add(key);
    }

    const manifestName = kind === "pet" ? "pet.json" : "theme.json";
    const files = normalized.filter((item) => !item.entry.isDirectory);
    let prefix = "";
    if (!files.some((item) => item.name === manifestName)) {
      const candidates = files.filter((item) => item.name.split("/").length === 2 && item.name.endsWith(`/${manifestName}`));
      if (candidates.length !== 1) return { ok: false, error: `压缩包里没有找到根目录或单一子目录中的 ${manifestName}` };
      prefix = candidates[0].name.slice(0, candidates[0].name.indexOf("/") + 1);
    }
    const entryMap = new Map<string, (typeof zipEntries)[number]>();
    for (const item of files) {
      if (prefix && !item.name.startsWith(prefix)) throw new Error("压缩包文件必须全部位于同一个顶层目录中。");
      const relative = prefix ? item.name.slice(prefix.length) : item.name;
      if (!relative) throw new Error("压缩包中包含空文件路径。");
      entryMap.set(relative, item.entry);
    }
    const manifestEntry = entryMap.get(manifestName);
    if (!manifestEntry) return { ok: false, error: `压缩包里没有找到 ${manifestName}` };
    if (manifestEntry.header.size > MAX_RESOURCE_MANIFEST_BYTES) throw new Error("资源清单不能超过 1 MiB。");
    const manifestRaw = manifestEntry.getData();
    if (manifestRaw.byteLength !== manifestEntry.header.size) throw new Error("资源清单解压大小与压缩包声明不一致。");
    const manifest: unknown = JSON.parse(manifestRaw.toString("utf8"));
    let id: string;
    if (kind === "pet") {
      if (!isPetManifest(manifest)) throw new Error("桌宠清单格式无效或字段超出允许范围。");
      id = manifest.id;
    } else {
      if (!isThemeManifest(manifest)) throw new Error("主题清单格式无效或字段超出允许范围。");
      id = manifest.id;
    }
    const required = kind === "pet" ? "spritesheet.png" : "theme.css";
    const requiredEntry = entryMap.get(required);
    if (!requiredEntry) return { ok: false, error: `压缩包里缺少 ${required}` };
    if (kind === "pet") {
      const signature = requiredEntry.getData().subarray(0, 8);
      if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("spritesheet.png 不是有效的 PNG 文件。");
    }
    const destination = path.join(userDataRootFor(), kind === "pet" ? "pets" : "themes", id);
    const staging = `${destination}.staging-${process.pid}-${Date.now()}`;
    await mkdir(path.dirname(destination), { recursive: true });
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    try {
      for (const [relative, entry] of entryMap) {
        if (kind === "theme" && relative === "theme.css" && entry.header.size > MAX_RESOURCE_MANIFEST_BYTES) {
          throw new Error("theme.css 不能超过 1 MiB。");
        }
        if (kind === "pet" && relative === "preview.png" && entry.header.size > MAX_RESOURCE_PREVIEW_BYTES) {
          throw new Error("preview.png 不能超过 8 MiB。");
        }
        const target = path.resolve(staging, ...relative.split("/"));
        const inside = path.relative(staging, target);
        if (!inside || inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
          throw new Error(`压缩包路径越界：${relative}`);
        }
        const data = entry.getData();
        if (data.byteLength !== entry.header.size) throw new Error(`文件解压大小与压缩包声明不一致：${relative}`);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, data, { flag: "wx" });
      }
      await replaceDirectory(staging, destination);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function removeResource(kind: "pet" | "theme", rawId: unknown): Promise<{ ok: boolean; error?: string }> {
  const id = safeId(rawId);
  if (!id) return { ok: false, error: "非法的资源 id" };
  if (kind === "pet") {
    const settings = await getSettings();
    if (settings.pet.activePetId === id) {
      await setSettings({ pet: { activePetId: null, enabled: false } });
    }
    const manifest = await readJson<PetManifest>(path.join(userDataRootFor(), "pets", id, "pet.json"));
    if (manifest?.id) {
      const bundled = await readJson<PetManifest>(path.join(bundledPetsRoot(), id, "pet.json"));
      if (bundled?.id === id && !settings.removedBundledPets.includes(id)) {
        await setSettings({ removedBundledPets: [...settings.removedBundledPets, id] });
      }
    }
  } else if (kind === "theme") {
    const settings = await getSettings();
    if (settings.theme.activeThemeId === id) {
      await setSettings({ theme: { activeThemeId: null } });
    }
  }
  await rm(path.join(userDataRootFor(), kind === "pet" ? "pets" : "themes", id), { recursive: true, force: true });
  return { ok: true };
}

/** Full resource payload for the pet renderer: manifest + spritesheet data URL. */
export async function getPetPayload(rawId: unknown): Promise<{ manifest: PetManifest; spritesheetDataUrl: string } | null> {
  const id = safeId(rawId);
  if (!id) return null;
  const dir = path.join(userDataRootFor(), "pets", id);
  const manifest = await readJson<PetManifest>(path.join(dir, "pet.json"));
  if (!manifest?.id) return null;
  const spritesheetDataUrl = await fileToDataUrl(path.join(dir, "spritesheet.png"), "image/png");
  if (!spritesheetDataUrl) return null;
  return { manifest, spritesheetDataUrl };
}

export async function getActiveThemeCss(): Promise<string | null> {
  const settings = await getSettings();
  if (!settings.theme.activeThemeId) return null;
  const id = safeId(settings.theme.activeThemeId);
  if (!id) return null;
  try {
    return await readFile(path.join(userDataRootFor(), "themes", id, "theme.css"), "utf8");
  } catch {
    return null;
  }
}

/* ---------------- IPC ---------------- */

export interface NetworkInfo {
  proxySource: string;
  proxyUrl: string | null;
  port: number;
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
}

export function registerSettingsIpc(handlers: {
  onResourceChanged: () => Promise<void> | void;
}): void {
  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:set", async (_event, patch: unknown) => {
    const settings = await setSettings(patch);
    return settings;
  });
  ipcMain.handle("settings:export", async () => {
    const result = await dialog.showSaveDialog({
      title: "导出设置",
      defaultPath: "k-pi-agent-settings.json",
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, error: "已取消" };
    await writeFile(result.filePath, JSON.stringify(await getSettings(), null, 2), "utf8");
    return { ok: true, path: result.filePath };
  });
  ipcMain.handle("settings:import", async () => {
    const result = await dialog.showOpenDialog({
      title: "导入设置",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, error: "已取消" };
    try {
      const imported = JSON.parse(await readFile(result.filePaths[0], "utf8"));
      const settings = await setSettings(imported);
      return { ok: true, settings };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("pets:list", () => listPets());
  ipcMain.handle("pets:install", async () => {
    const outcome = await installResourceFromZip("pet");
    if (outcome.ok) await handlers.onResourceChanged();
    return outcome;
  });
  ipcMain.handle("pets:remove", async (_event, id: unknown) => {
    const outcome = await removeResource("pet", id);
    await handlers.onResourceChanged();
    return outcome;
  });
  ipcMain.handle("themes:list", () => listThemes());
  ipcMain.handle("themes:install", async () => {
    const outcome = await installResourceFromZip("theme");
    if (outcome.ok) await handlers.onResourceChanged();
    return outcome;
  });
  ipcMain.handle("themes:remove", async (_event, id: unknown) => {
    const outcome = await removeResource("theme", id);
    await handlers.onResourceChanged();
    return outcome;
  });
  ipcMain.handle("pet:getData", (_event, id: unknown) => getPetPayload(id));
  ipcMain.handle("app:networkInfo", async (): Promise<NetworkInfo> => {
    const network = await resolveNetworkEnvironment();
    const { PI_WEB_PORT } = await import("./pi-web-service.js");
    return {
      proxySource: network.source,
      proxyUrl: network.proxyUrl ?? null,
      port: PI_WEB_PORT,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node
    };
  });
  ipcMain.handle("app:openPath", async (_event, which: unknown) => {
    if (which === "logs") return shell.openPath(app.getPath("logs"));
    if (which === "userData") return shell.openPath(userDataRootFor());
    if (which === "piData") return shell.openPath(path.join(app.getPath("home"), ".pi", "agent"));
    return { ok: false };
  });
}
