import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seed = path.join(root, "resources", "seed");
const manifest = JSON.parse(await readFile(path.join(seed, "manifest.json"), "utf8"));
const nodePath = path.join(seed, "runtime", `node-v${manifest.nodeVersion}-win-x64`, "node.exe");
const entryPath = path.join(root, "resources", "seed", "pi-web", "node_modules", "@agegr", "pi-web", "bin", "pi-web.js");
const url = `http://127.0.0.1:${process.env.SMOKE_PORT ?? 30141}`;
// SMOKE_PORT lets the smoke test run next to a live instance of the app
// (which permanently occupies the default 30141).
const port = process.env.SMOKE_PORT ?? 30141;
await Promise.all([access(nodePath), access(entryPath)]);
const agentDir = await mkdtemp(path.join(tmpdir(), "k-pi-smoke-"));

const child = spawn(nodePath, [entryPath, "--no-open", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: path.dirname(entryPath),
  env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
  windowsHide: true,
  stdio: "pipe"
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
try {
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Pi Web is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error(`Pi Web did not become ready.\n${output}`);
  console.log(`Pi Web payload smoke test passed: HTTP 200 on 127.0.0.1:${port}.`);
} finally {
  child.kill("SIGTERM");
  const exited = new Promise((resolve) => child.once("exit", resolve));
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 6_000))]);
  if (child.exitCode !== null || child.signalCode !== null) await rm(agentDir, { recursive: true, force: true });
}
