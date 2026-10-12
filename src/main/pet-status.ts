import { app } from "electron";
import { open } from "node:fs/promises";
import path from "node:path";
import { newestSessionFile } from "./session-scan.js";

/**
 * Pi session state watcher — ported from the original pi-pet pet.py logic:
 * - Watches the newest session file under ~/.pi/agent/sessions/<cwd-group>/*.jsonl
 * - age < 15s                          -> working  (agent is generating)
 * - last entry role=assistant, < 180s  -> waiting  (pi finished, waiting for user)
 * - role user/toolResult, < 45s        -> working  (fresh input/tool result)
 * - age > 600s                         -> sleep
 * - otherwise                          -> idle
 * A 12s cooldown prevents rapid flip-flopping between states.
 */

export type PetPiState = "working" | "waiting" | "idle" | "sleep";

const WORKING_GRACE_MS = 15_000;
const WAIT_WINDOW_MS = 180_000;
const APPROVAL_WINDOW_MS = 45_000;
const SLEEP_AFTER_MS = 600_000;
// shortcut: rescan all session files every 10s; use file watchers if very large libraries still cost too much.
const POLL_MS = 10_000;
const COOLDOWN_MS = 12_000;
const TAIL_BYTES = 65_536;

let timer: NodeJS.Timeout | undefined;
let lastSig = "";
let lastActive = Date.now();
let lastState: PetPiState = "idle";
let lastSwitch = 0;
let listener: ((state: PetPiState) => void) | undefined;

/** Reads the tail of the session file and returns the last parseable entry role. */
async function lastLineRole(file: string, size: number): Promise<string | null> {
  const handle = await open(file, "r").catch(() => null);
  if (!handle) return null;
  try {
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const lines = buffer.toString("utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        const role = obj?.message?.role ?? obj?.role;
        if (role) return String(role);
      } catch {
        continue; // partial line at the buffer head
      }
    }
    return null;
  } finally {
    await handle.close();
  }
}

async function computeState(): Promise<PetPiState> {
  const agentDataDirectory = process.env.PI_CODING_AGENT_DIR ?? path.join(app.getPath("home"), ".pi", "agent");
  const newest = await newestSessionFile(path.join(agentDataDirectory, "sessions"));
  if (!newest) return "idle";
  const sig = `${newest.mtimeMs}|${newest.size}`;
  if (sig !== lastSig) {
    lastSig = sig;
    lastActive = Date.now();
  }
  const age = Date.now() - lastActive;
  if (age < WORKING_GRACE_MS) return "working";
  if (age > SLEEP_AFTER_MS) return "sleep";
  const role = await lastLineRole(newest.file, newest.size);
  if (role === "assistant" && age < WAIT_WINDOW_MS) return "waiting";
  if ((role === "user" || role === "toolResult") && age < APPROVAL_WINDOW_MS) return "working";
  return "idle";
}

async function poll(): Promise<void> {
  try {
    const state = await computeState();
    const now = Date.now();
    if (state !== lastState && now - lastSwitch >= COOLDOWN_MS) {
      lastState = state;
      lastSwitch = now;
      listener?.(state);
    }
  } catch {
    // never let the watcher crash the app
  }
}

export function startPetStatusWatcher(onState: (state: PetPiState) => void): void {
  if (timer) return;
  listener = onState;
  timer = setInterval(() => { void poll(); }, POLL_MS);
  void poll();
}

export function stopPetStatusWatcher(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
