import { dialog } from "electron";
import { rm } from "node:fs/promises";
import path from "node:path";
import { dataRoot, readJson, writeJsonAtomic } from "./paths.js";
import { commitPayloadPointers } from "./update-transaction.js";
import { smokePiWebPayload } from "./pi-web-smoke.js";
import type { PiWebManager } from "./pi-web-manager.js";
import type { PiWebInfo } from "./pi-web-manager.js";
import type { RuntimeInfo, RuntimeManager } from "./runtime-manager.js";

interface PayloadPointer { version: string; directory: string; }
interface UpdateJournal {
  version: 1;
  previous: { runtime: PayloadPointer; piWeb: PayloadPointer };
}

export class UpdateManager {
  private journalFile = path.join(dataRoot(), "update-transaction.json");

  constructor(private readonly runtime: RuntimeManager, private readonly piWeb: PiWebManager) {}

  async recoverInterruptedInstall(): Promise<void> {
    const journal = await readJson<unknown>(this.journalFile);
    if (journal === undefined) return;
    if (!this.isJournal(journal)) throw new Error("Update recovery file is invalid; payload pointers were left untouched.");
    await this.runtime.activate(this.runtimeInfo(journal.previous.runtime));
    await this.piWeb.activate(this.piWebInfo(journal.previous.piWeb));
    await rm(this.journalFile, { force: true });
  }

  /** Checks both feeds without making startup depend on network availability. */
  async checkAndOffer(): Promise<void> {
    const [piResult, runtimeResult] = await Promise.allSettled([this.piWeb.hasUpdate(), this.runtime.hasUpdate()]);
    if (piResult.status === "rejected" && runtimeResult.status === "rejected") return;

    const pi = piResult.status === "fulfilled" ? piResult.value : undefined;
    const runtime = runtimeResult.status === "fulfilled" ? runtimeResult.value : undefined;
    const lines = [
      pi?.latest ? `Pi Web: ${pi.current.version} → ${pi.latest.version}` : undefined,
      runtime?.latest ? `Node runtime: ${runtime.current.version} → ${runtime.latest}` : undefined
    ].filter((line): line is string => Boolean(line));
    if (!lines.length) return;

    const { response } = await dialog.showMessageBox({
      type: "info",
      title: "K pi agent updates available",
      message: lines.join("\n"),
      detail: "Updates are downloaded with integrity checks and take effect after restarting K pi agent.",
      buttons: ["Update now", "Later"],
      defaultId: 0,
      cancelId: 1
    });
    if (response !== 0) return;

    try {
      const [previousRuntime, previousPiWeb] = await Promise.all([
        runtime?.current ? Promise.resolve(runtime.current) : this.runtime.current(),
        pi?.current ? Promise.resolve(pi.current) : this.piWeb.current()
      ]);
      // Stage both payloads first; the startup journal makes two pointer writes recoverable as one update.
      const installedRuntime = runtime?.latest
        ? await this.runtime.install(runtime.latest, false)
        : previousRuntime;
      const installedPiWeb = pi?.latest
        ? await this.piWeb.install(pi.latest, installedRuntime, false)
        : previousPiWeb;
      await smokePiWebPayload(installedRuntime.nodePath, installedPiWeb.directory);
      await this.commit(previousRuntime, previousPiWeb, installedRuntime, installedPiWeb);
      await dialog.showMessageBox({
        type: "info",
        title: "Update ready",
        message: "The update is ready. Restart K pi agent to use it.",
        buttons: ["OK"]
      });
    } catch (error) {
      await dialog.showMessageBox({
        type: "error",
        title: "Update failed safely",
        message: error instanceof Error ? error.message : String(error),
        detail: "如果提交过程被中断，下次启动时会从本地事务记录恢复旧版本指针。"
      });
    }
  }

  private async commit(previousRuntime: RuntimeInfo, previousPiWeb: PiWebInfo, nextRuntime: RuntimeInfo, nextPiWeb: PiWebInfo): Promise<void> {
    const journal: UpdateJournal = {
      version: 1,
      previous: {
        runtime: { version: previousRuntime.version, directory: previousRuntime.directory },
        piWeb: { version: previousPiWeb.version, directory: previousPiWeb.directory }
      }
    };
    await commitPayloadPointers(
      { runtime: previousRuntime, piWeb: previousPiWeb },
      { runtime: nextRuntime, piWeb: nextPiWeb },
      {
        writeJournal: () => writeJsonAtomic(this.journalFile, journal),
        clearJournal: () => rm(this.journalFile, { force: true }),
        activateRuntime: (info) => this.runtime.activate(info),
        activatePiWeb: (info) => this.piWeb.activate(info)
      }
    );
  }

  private isJournal(value: unknown): value is UpdateJournal {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const journal = value as Partial<UpdateJournal>;
    if (journal.version !== 1 || !journal.previous) return false;
    return this.isPointer(journal.previous.runtime, "runtime") && this.isPointer(journal.previous.piWeb, "pi-web");
  }

  private isPointer(value: unknown, name: "runtime" | "pi-web"): value is PayloadPointer {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const pointer = value as Partial<PayloadPointer>;
    if (typeof pointer.version !== "string" || !pointer.version || pointer.version.length > 80 ||
      typeof pointer.directory !== "string" || !pointer.directory) return false;
    const root = path.resolve(dataRoot(), name);
    const directory = path.resolve(pointer.directory);
    const relative = path.relative(root, directory);
    return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }

  private runtimeInfo(pointer: PayloadPointer): RuntimeInfo {
    return { ...pointer, nodePath: path.join(pointer.directory, "node.exe") };
  }

  private piWebInfo(pointer: PayloadPointer): PiWebInfo {
    return { ...pointer, entryPath: path.join(pointer.directory, "node_modules", "@agegr", "pi-web", "bin", "pi-web.js") };
  }
}
