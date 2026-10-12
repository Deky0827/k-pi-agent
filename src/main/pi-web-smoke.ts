import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { waitForHttpReady } from "./port-guard.js";

const execFileAsync = promisify(execFile);

async function availablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") throw new Error("Could not allocate a local Pi Web smoke-test port.");
  return address.port;
}

export async function smokePiWebPayload(nodePath: string, directory: string): Promise<void> {
  const port = await availablePort();
  const agentDirectory = await mkdtemp(path.join(tmpdir(), "k-pi-update-smoke-"));
  const entryPath = path.join(directory, "node_modules", "@agegr", "pi-web", "bin", "pi-web.js");
  const child = spawn(nodePath, [entryPath, "--no-open", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: directory,
    windowsHide: true,
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: agentDirectory,
      PI_WEB_NO_OPEN: "1",
      PI_WEB_HOSTNAME: "127.0.0.1",
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  const collect = (chunk: Buffer) => { output = `${output}${chunk.toString("utf8")}`.slice(-8_192); };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  const controller = new AbortController();
  let rejectEarlyExit!: (error: Error) => void;
  const earlyExit = new Promise<never>((_resolve, reject) => { rejectEarlyExit = reject; });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.once("error", (error) => rejectEarlyExit(error));
  child.once("exit", (code, signal) => {
    const error = new Error(`Pi Web smoke process exited early (code=${code ?? "unknown"}, signal=${signal ?? "none"}).`);
    controller.abort(error);
    rejectEarlyExit(error);
  });

  let smokeError: unknown;
  try {
    await Promise.race([waitForHttpReady(`http://127.0.0.1:${port}`, 60_000, controller.signal), earlyExit]);
  } catch (error) {
    smokeError = error;
  } finally {
    controller.abort(new Error("Pi Web smoke test finished."));
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      child.kill("SIGTERM");
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    }
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      await execFileAsync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).catch(() => undefined);
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      throw new Error(`Pi Web smoke process did not exit; temporary agent data was kept at ${agentDirectory}.`);
    }
    await rm(agentDirectory, { recursive: true, force: true });
  }
  if (smokeError) throw new Error(`Pi Web staged payload failed its local HTTP health check: ${smokeError instanceof Error ? smokeError.message : String(smokeError)}\n${output}`);
}
