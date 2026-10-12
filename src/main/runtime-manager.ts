import AdmZip from "adm-zip";
import { execFile } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { compareVersions } from "./semver.js";
import { copySeedOnce, dataRoot, readJson, replaceDirectory, seedRoot, writeJsonAtomic } from "./paths.js";
import { downloadFile, fetchJson, fetchText, sha256 } from "./download.js";

const execFileAsync = promisify(execFile);
const NODE_INDEX_URL = "https://nodejs.org/dist/index.json";

interface RuntimePointer { version: string; directory: string; }
interface NodeRelease { version: string; files: string[]; lts: string | false; }

export interface RuntimeInfo {
  version: string;
  directory: string;
  nodePath: string;
}

export class RuntimeManager {
  private root = path.join(dataRoot(), "runtime");
  private pointerFile = path.join(this.root, "current.json");

  async current(): Promise<RuntimeInfo> {
    await mkdir(this.root, { recursive: true });
    const pointer = await readJson<RuntimePointer>(this.pointerFile);
    if (pointer) {
      const nodePath = path.join(pointer.directory, "node.exe");
      try {
        const { stdout } = await execFileAsync(nodePath, ["--version"], { windowsHide: true });
        return { version: stdout.trim().replace(/^v/, ""), directory: pointer.directory, nodePath };
      } catch {
        // A partially copied or deleted payload is reseeded below.
      }
    }

    const seed = path.join(seedRoot(), "runtime");
    const seeded = (await readdir(seed, { withFileTypes: true })).find((item) => item.isDirectory());
    if (!seeded) throw new Error("Bundled Node runtime is missing. Run npm run prepare:payload before packaging.");
    const source = path.join(seed, seeded.name);
    const destination = path.join(this.root, seeded.name);
    await copySeedOnce(source, destination);
    const nodePath = path.join(destination, "node.exe");
    const { stdout } = await execFileAsync(nodePath, ["--version"], { windowsHide: true });
    const version = stdout.trim().replace(/^v/, "");
    await writeJsonAtomic(this.pointerFile, { version, directory: destination } satisfies RuntimePointer);
    return { version, directory: destination, nodePath };
  }

  async latestSupported(): Promise<string | undefined> {
    const releases = await fetchJson<NodeRelease[]>(NODE_INDEX_URL);
    const current = releases.find((release) => /^v22\./.test(release.version) && release.files.includes("win-x64-zip"));
    return current?.version.replace(/^v/, "");
  }

  async hasUpdate(): Promise<{ current: RuntimeInfo; latest?: string }> {
    const current = await this.current();
    const latest = await this.latestSupported();
    return { current, latest: latest && compareVersions(latest, current.version) > 0 ? latest : undefined };
  }

  async install(version: string, activate = true): Promise<RuntimeInfo> {
    if (!/^22\.\d+\.\d+$/.test(version)) throw new Error("Only Node 22 maintenance releases are permitted.");
    const destination = path.join(this.root, `node-v${version}-win-x64`);
    const nodePath = path.join(destination, "node.exe");
    try {
      const { stdout } = await execFileAsync(nodePath, ["--version"], { windowsHide: true });
      const installed = stdout.trim().replace(/^v/, "");
      const info = { version: installed, directory: destination, nodePath };
      if (activate) await this.activate(info);
      return info;
    } catch { /* install fresh below */ }

    const staging = `${destination}.staging-${Date.now()}`;
    const zipPath = path.join(this.root, `node-v${version}-win-x64.zip`);
    await rm(staging, { recursive: true, force: true });
    try {
      await downloadFile(`https://nodejs.org/dist/v${version}/node-v${version}-win-x64.zip`, zipPath);
      const checksums = await fetchText(`https://nodejs.org/dist/v${version}/SHASUMS256.txt`);
      const expected = checksums.match(new RegExp(`^([a-f0-9]{64})\\s+node-v${version}-win-x64\\.zip$`, "m"))?.[1];
      if (!expected || (await sha256(zipPath)) !== expected) throw new Error("Node runtime checksum verification failed.");

      new AdmZip(zipPath).extractAllTo(staging, true);
      const [extracted] = await readdir(staging, { withFileTypes: true });
      if (!extracted?.isDirectory()) throw new Error("The Node runtime archive has an unexpected layout.");
      const extractedRoot = path.join(staging, extracted.name);
      await replaceDirectory(extractedRoot, destination);
      await rm(staging, { recursive: true, force: true });
      const { stdout } = await execFileAsync(nodePath, ["--version"], { windowsHide: true });
      const installed = stdout.trim().replace(/^v/, "");
      const info = { version: installed, directory: destination, nodePath };
      if (activate) await this.activate(info);
      return info;
    } finally {
      await rm(staging, { recursive: true, force: true });
      await rm(zipPath, { force: true });
    }
  }

  async activate(info: RuntimeInfo): Promise<void> {
    await writeJsonAtomic(this.pointerFile, { version: info.version, directory: info.directory } satisfies RuntimePointer);
  }
}
