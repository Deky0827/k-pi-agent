import { app } from "electron";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export { replaceDirectory } from "./directory-ops.js";

export function seedRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "seed")
    : path.resolve(process.cwd(), "resources", "seed");
}

/** Bundled pet resource packages, copied into userData/pets on first run. */
export function bundledPetsRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "seed-pets")
    : path.resolve(process.cwd(), "resources", "seed-pets");
}

/** Native settings window UI (plain HTML, no pi-web involvement). */
export function settingsUiRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "settings-ui")
    : path.resolve(process.cwd(), "resources", "settings-ui");
}

/** Desktop-pet runtime (canvas renderer + state machine). */
export function petRuntimeRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "pet-runtime")
    : path.resolve(process.cwd(), "resources", "pet-runtime");
}

export function dataRoot(): string {
  return path.join(app.getPath("userData"), "payloads");
}

export async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

export function isCopyTargetAlreadyPresent(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EEXIST" || code === "ERR_FS_CP_EEXIST";
}

export async function copySeedOnce(seed: string, destination: string): Promise<void> {
  try {
    await cp(seed, destination, { recursive: true, errorOnExist: true, force: false });
  } catch (error) {
    if (!isCopyTargetAlreadyPresent(error)) throw error;
  }
}
