import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { networkFetch } from "./network.js";

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await networkFetch(url, { headers: { "User-Agent": "K-Pi-Agent" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return (await response.json()) as T;
}

export async function downloadFile(url: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  await rm(temporary, { force: true });
  const response = await networkFetch(url, { redirect: "follow", headers: { "User-Agent": "K-Pi-Agent" } });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${url}`);
  // Node's bundled undici and @types/node currently expose slightly different
  // Web ReadableStream generics; both are the standard byte stream at runtime.
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporary));
  await rm(destination, { force: true });
  const { rename } = await import("node:fs/promises");
  await rename(temporary, destination);
}

export async function fetchText(url: string): Promise<string> {
  const response = await networkFetch(url, { headers: { "User-Agent": "K-Pi-Agent" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return response.text();
}

export async function sha256(file: string): Promise<string> {
  const bytes = await readFile(file);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function verifyNpmIntegrity(file: string, integrity: string): Promise<void> {
  const match = /^sha512-([A-Za-z0-9+/=]+)$/.exec(integrity);
  if (!match) throw new Error("Registry returned an unsupported npm integrity value.");
  const digest = createHash("sha512").update(await readFile(file)).digest("base64");
  if (digest !== match[1]) throw new Error("Downloaded Pi Web archive failed its npm integrity check.");
}
