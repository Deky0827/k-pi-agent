import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { compareVersions } from "./semver.js";
import { copySeedOnce, dataRoot, readJson, replaceDirectory, seedRoot, writeJsonAtomic } from "./paths.js";
import { downloadFile, fetchJson, verifyNpmIntegrity } from "./download.js";
import type { RuntimeInfo } from "./runtime-manager.js";

const REGISTRY_URL = "https://registry.npmjs.org/@agegr%2Fpi-web/latest";

interface PiWebPointer { version: string; directory: string; }
interface RegistryRelease {
  version: string;
  dist: { tarball: string; integrity: string };
}

export interface PiWebInfo {
  version: string;
  directory: string;
  entryPath: string;
}

function npmCli(runtime: RuntimeInfo): string {
  return path.join(runtime.directory, "node_modules", "npm", "bin", "npm-cli.js");
}

export class PiWebManager {
  private root = path.join(dataRoot(), "pi-web");
  private pointerFile = path.join(this.root, "current.json");

  async current(): Promise<PiWebInfo> {
    await mkdir(this.root, { recursive: true });
    const pointer = await readJson<PiWebPointer>(this.pointerFile);
    if (pointer) {
      const entryPath = path.join(pointer.directory, "node_modules", "@agegr", "pi-web", "bin", "pi-web.js");
      try {
        await import("node:fs/promises").then(({ access }) => access(entryPath));
        return { version: pointer.version, directory: pointer.directory, entryPath };
      } catch { /* reseed below */ }
    }

    const manifest = await readJson<{ piWebVersion: string }>(path.join(seedRoot(), "manifest.json"));
    const seed = path.join(seedRoot(), "pi-web");
    if (!manifest) throw new Error("Bundled Pi Web payload is missing. Run npm run prepare:payload before packaging.");
    const destination = path.join(this.root, manifest.piWebVersion);
    await copySeedOnce(seed, destination);
    const entryPath = path.join(destination, "node_modules", "@agegr", "pi-web", "bin", "pi-web.js");
    await import("node:fs/promises").then(({ access }) => access(entryPath));
    await writeJsonAtomic(this.pointerFile, { version: manifest.piWebVersion, directory: destination } satisfies PiWebPointer);
    return { version: manifest.piWebVersion, directory: destination, entryPath };
  }

  async latest(): Promise<RegistryRelease> {
    return fetchJson<RegistryRelease>(REGISTRY_URL);
  }

  async hasUpdate(): Promise<{ current: PiWebInfo; latest?: RegistryRelease }> {
    const current = await this.current();
    const latest = await this.latest();
    return { current, latest: compareVersions(latest.version, current.version) > 0 ? latest : undefined };
  }

  async install(release: RegistryRelease, runtime: RuntimeInfo, activate = true): Promise<PiWebInfo> {
    const destination = path.join(this.root, release.version);
    const entryPath = path.join(destination, "node_modules", "@agegr", "pi-web", "bin", "pi-web.js");
    try {
      await import("node:fs/promises").then(({ access }) => access(entryPath));
      const info = { version: release.version, directory: destination, entryPath };
      if (activate) await this.activate(info);
      return info;
    } catch { /* install fresh below */ }

    const staging = `${destination}.staging-${Date.now()}`;
    const archive = path.join(staging, "pi-web.tgz");
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    try {
      await downloadFile(release.dist.tarball, archive);
      await verifyNpmIntegrity(archive, release.dist.integrity);
      await run(runtime.nodePath, [npmCli(runtime), "install", "--prefix", staging, "--omit=dev", "--no-audit", "--no-fund", archive]);
      await rm(archive, { force: true });
      await replaceDirectory(staging, destination);
      const info = { version: release.version, directory: destination, entryPath };
      if (activate) await this.activate(info);
      return info;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  async activate(info: PiWebInfo): Promise<void> {
    await writeJsonAtomic(this.pointerFile, { version: info.version, directory: info.directory } satisfies PiWebPointer);
  }
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Package installation failed with exit code ${code ?? "unknown"}.`)));
  });
}
