/*
 * Produces the immutable seed bundled into K pi agent. The installed app copies
 * this seed to LocalAppData before running it, allowing later runtime/package
 * updates without modifying the EXE itself.
 */
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seed = path.join(root, "resources", "seed");
const payloadPackage = JSON.parse(await readFile(path.join(root, "payload", "pi-web", "package.json"), "utf8"));
const payloadLock = await readFile(path.join(root, "payload", "pi-web", "package-lock.json"), "utf8");
const piWebVersion = payloadPackage.dependencies["@agegr/pi-web"];
const nodeVersion = "22.23.3";
const piWebRoot = path.join(seed, "pi-web");
const runtimeRoot = path.join(seed, "runtime", `node-v${nodeVersion}-win-x64`);
try {
  const [manifest, piPackage, installedLock] = await Promise.all([
    readFile(path.join(seed, "manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(piWebRoot, "node_modules", "@agegr", "pi-web", "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(piWebRoot, "package-lock.json"), "utf8")
  ]);
  const nodePath = path.join(runtimeRoot, "node.exe");
  await access(nodePath);
  const installedNodeVersion = execFileSync(nodePath, ["--version"], { encoding: "utf8", windowsHide: true }).trim().replace(/^v/, "");
  if (manifest.piWebVersion === piWebVersion && piPackage.version === piWebVersion && installedLock === payloadLock && installedNodeVersion === nodeVersion) {
    console.log(`Pi Web ${piWebVersion} with Node ${nodeVersion} is already prepared.`);
    process.exit(0);
  }
} catch { /* prepare missing or mismatched payload below */ }

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${url}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function run(command, args, env = process.env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} failed with ${code ?? "unknown"}`)));
  });
}

await rm(piWebRoot, { recursive: true, force: true });
await mkdir(piWebRoot, { recursive: true });
const packageFile = path.join(piWebRoot, "package.json");
const userNpmConfig = path.join(seed, "npm-payload.npmrc");
const registryUrl = new URL(process.env.npm_config_registry ?? "https://registry.npmjs.org/");
if (!["https:", "http:"].includes(registryUrl.protocol) || registryUrl.username || registryUrl.password) {
  throw new Error("The configured npm registry URL is invalid.");
}
await writeFile(packageFile, JSON.stringify(payloadPackage));
await writeFile(path.join(piWebRoot, "package-lock.json"), payloadLock);
await writeFile(userNpmConfig, `registry=${registryUrl.origin}${registryUrl.pathname}\n`);
const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const npmEnv = { ...process.env, npm_config_userconfig: userNpmConfig };
delete npmEnv.npm_config_allow_scripts;
try {
  await run(process.execPath, [npmCli,
    "ci", "--prefix", piWebRoot, "--omit=dev", "--no-audit", "--no-fund"
  ], npmEnv);
} finally {
  await rm(packageFile, { force: true });
  await rm(userNpmConfig, { force: true });
}

const archive = path.join(seed, `node-v${nodeVersion}-win-x64.zip`);
await download(`https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-win-x64.zip`, archive);
const shasums = await (await fetch(`https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`)).text();
const expected = shasums.match(new RegExp(`^([a-f0-9]{64})\\s+node-v${nodeVersion}-win-x64\\.zip$`, "m"))?.[1];
const actual = createHash("sha256").update(await readFile(archive)).digest("hex");
if (!expected || expected !== actual) throw new Error("Node runtime SHA-256 check failed.");

await rm(runtimeRoot, { recursive: true, force: true });
const staging = `${runtimeRoot}.staging`;
await rm(staging, { recursive: true, force: true });
new AdmZip(archive).extractAllTo(staging, true);
const [directory] = await readdir(staging, { withFileTypes: true });
if (!directory?.isDirectory()) throw new Error("Unexpected Node archive layout.");
await mkdir(path.dirname(runtimeRoot), { recursive: true });
await rename(path.join(staging, directory.name), runtimeRoot);
await rm(staging, { recursive: true, force: true });
await rm(archive, { force: true });
await writeFile(path.join(seed, "manifest.json"), `${JSON.stringify({ piWebVersion, nodeVersion }, null, 2)}\n`);
console.log(`Prepared Pi Web ${piWebVersion} with Node ${nodeVersion}.`);
