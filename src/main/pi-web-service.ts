import { ChildProcess, execFile, spawn } from "node:child_process";
import { appendFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { assertPortAvailable, waitForHttpReady } from "./port-guard.js";
import type { PiWebInfo } from "./pi-web-manager.js";
import type { RuntimeInfo } from "./runtime-manager.js";
import type { NetworkEnvironment } from "./network.js";

const execFileAsync = promisify(execFile);
// K_AGENT_PORT lets a second instance run side-by-side for testing.
export const PI_WEB_PORT = Number(process.env.K_AGENT_PORT) || 30141;
export const PI_WEB_URL = `http://127.0.0.1:${PI_WEB_PORT}`;

// Model-API hosts that are reachable directly from this network and must never
// be routed through an injected proxy. undici's EnvHttpProxyAgent (used by the
// pi runtime) matches these entries exactly or as subdomain suffixes, so
// "maas.aliyuncs.com" covers the dedicated-workspace endpoints as well.
// Bypassing the proxy for them keeps Pi working when the proxy client is closed
// (stale/dead proxy address) and saves proxy bandwidth when it is running.
const DIRECT_API_HOSTS = "api.siliconflow.cn,api.relayrouter.ai,open.bigmodel.cn,maas.aliyuncs.com";

export class PiWebService {
  private child: ChildProcess | undefined;
  private readyChild: ChildProcess | undefined;
  private stopping = false;
  private lifecycleGeneration = 0;
  private stopTask: Promise<void> | undefined;
  private startAbort: AbortController | undefined;
  private logFile = path.join(app.getPath("logs"), "pi-web.log");
  private unexpectedExitHandler: ((reason: string) => void) | undefined;

  onUnexpectedExit(handler: (reason: string) => void): void {
    this.unexpectedExitHandler = handler;
  }

  async start(runtime: RuntimeInfo, piWeb: PiWebInfo, network: NetworkEnvironment): Promise<void> {
    if (this.child?.exitCode === null) return;
    const generation = ++this.lifecycleGeneration;
    await assertPortAvailable(PI_WEB_PORT);
    if (generation !== this.lifecycleGeneration) throw new Error("Pi Web startup was canceled.");
    await mkdir(path.dirname(this.logFile), { recursive: true });
    if (generation !== this.lifecycleGeneration) throw new Error("Pi Web startup was canceled.");
    const child = spawn(runtime.nodePath, [piWeb.entryPath, "--no-open", "--hostname", "127.0.0.1", "--port", String(PI_WEB_PORT)], {
      cwd: path.dirname(piWeb.entryPath),
      windowsHide: true,
      env: {
        ...process.env,
        PATH: `${runtime.directory};${process.env.PATH ?? ""}`,
        ...(network.proxyUrl && !process.env.HTTP_PROXY ? { HTTP_PROXY: network.proxyUrl } : {}),
        ...(network.proxyUrl && !process.env.HTTPS_PROXY ? { HTTPS_PROXY: network.proxyUrl } : {}),
        NO_PROXY: [process.env.NO_PROXY, DIRECT_API_HOSTS, "localhost,127.0.0.1,::1"].filter(Boolean).join(","),
        PI_WEB_NO_OPEN: "1",
        PI_WEB_HOSTNAME: "127.0.0.1",
        PORT: String(PI_WEB_PORT)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.child = child;
    const controller = new AbortController();
    this.startAbort = controller;
    let rejectBeforeReady!: (error: Error) => void;
    const exitedBeforeReady = new Promise<never>((_resolve, reject) => { rejectBeforeReady = reject; });
    child.stdout?.on("data", (chunk: Buffer) => { void appendFile(this.logFile, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { void appendFile(this.logFile, chunk); });
    child.once("error", (error) => {
      void appendFile(this.logFile, `[spawn error] ${error.message}\n`);
      controller.abort(error);
      rejectBeforeReady(error);
    });
    child.once("exit", (code, signal) => {
      const reason = `Pi Web 进程意外结束（code=${code ?? "unknown"}, signal=${signal ?? "none"}）。`;
      if (!this.stopping) void appendFile(this.logFile, `[unexpected exit] code=${code} signal=${signal}\n`);
      if (this.child === child) this.child = undefined;
      if (this.readyChild === child) {
        this.readyChild = undefined;
        if (!this.stopping) this.unexpectedExitHandler?.(reason);
      } else {
        controller.abort(new Error(reason));
        rejectBeforeReady(new Error(reason));
      }
    });
    try {
      await Promise.race([waitForHttpReady(PI_WEB_URL, 60_000, controller.signal), exitedBeforeReady]);
      if (generation !== this.lifecycleGeneration) throw new Error("Pi Web startup was canceled.");
      if (this.child !== child || child.exitCode !== null) throw new Error("Pi Web exited before becoming ready.");
      this.readyChild = child;
    } catch (error) {
      controller.abort(error);
      if (this.child === child) await this.stop();
      throw error;
    } finally {
      if (this.startAbort === controller) this.startAbort = undefined;
    }
  }

  async stop(): Promise<void> {
    ++this.lifecycleGeneration;
    this.startAbort?.abort(new Error("Pi Web startup was canceled."));
    if (this.stopTask) return this.stopTask;
    const child = this.child;
    if (!child?.pid) return;
    const task = (async () => {
      this.stopping = true;
      try {
        child.kill("SIGTERM");
        await Promise.race([
          new Promise<void>((resolve) => child.once("exit", () => resolve())),
          new Promise<void>((resolve) => setTimeout(resolve, 6_000))
        ]);
        if (child.exitCode === null && child.pid) {
          // Pi Web itself forwards SIGTERM to Next.js. This is only a bounded fallback
          // for the process tree started by this application, never a port-wide kill.
          await execFileAsync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).catch(() => undefined);
        }
      } finally {
        if (this.child === child) this.child = undefined;
        if (this.readyChild === child) this.readyChild = undefined;
        this.stopping = false;
      }
    })();
    this.stopTask = task;
    try {
      await task;
    } finally {
      if (this.stopTask === task) this.stopTask = undefined;
    }
  }

  async clearLogs(): Promise<void> {
    await rm(this.logFile, { force: true });
  }
}
