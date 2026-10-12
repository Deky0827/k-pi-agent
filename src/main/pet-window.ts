import { BrowserWindow, ipcMain, screen } from "electron";
import path from "node:path";
import { petRuntimeRoot } from "./paths.js";
import { getPetPayload, getSettings, setSettings, type KAgentSettings, type PetManifest } from "./store.js";
import { startPetStatusWatcher, stopPetStatusWatcher, type PetPiState } from "./pet-status.js";

interface PetWindow extends BrowserWindow {
  __petId?: string;
}

let petWindow: PetWindow | undefined;
let bubbleWindow: BrowserWindow | undefined;
let bubbleHideTimer: NodeJS.Timeout | undefined;
let lastManifest: PetManifest | undefined;
let lastKnownPiState: PetPiState = "idle";
let petSize: { width: number; height: number } | undefined;
let petStatusWatching = false;
let displayListenerRegistered = false;

const BUBBLE_WIDTH = 240;
const BUBBLE_HEIGHT = 46;
const BUBBLE_GAP = 6;

function petSpriteSize(manifest: PetManifest, scale: number): number {
  return Math.round(Math.min(320, Math.max(40, manifest.frameSize * scale)));
}

function clampToWorkArea(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const displays = screen.getAllDisplays();
  // pick the display nearest to the requested point, then clamp inside its work area
  const area = screen.getDisplayNearestPoint({ x: x + width / 2, y: y + height / 2 }).workArea;
  void displays;
  const minX = area.x - width + 60;            // keep at least 60px visible
  const maxX = area.x + area.width - 60;
  const minY = area.y;
  const maxY = area.y + area.height - 60;
  return {
    x: Math.min(Math.max(Math.round(x), minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(Math.round(y), minY), Math.max(minY, maxY))
  };
}

function movePetWindows(x: number, y: number): void {
  if (!petWindow || petWindow.isDestroyed() || !petSize) return;
  const pos = clampToWorkArea(x, y, petSize.width, petSize.height);
  // Atomic bounds with fixed size: prevents the Windows fractional-scaling DIP
  // rounding drift that made the pet grow/shrink while dragging.
  petWindow.setBounds({ x: pos.x, y: pos.y, width: petSize.width, height: petSize.height });
  if (bubbleWindow && !bubbleWindow.isDestroyed() && bubbleWindow.isVisible()) {
    bubbleWindow.setBounds({
      x: pos.x + Math.round((petSize.width - BUBBLE_WIDTH) / 2),
      y: pos.y - BUBBLE_HEIGHT - BUBBLE_GAP,
      width: BUBBLE_WIDTH,
      height: BUBBLE_HEIGHT
    });
  }
}

function ensureBubbleWindow(): void {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) return;
  bubbleWindow = new BrowserWindow({
    width: BUBBLE_WIDTH,
    height: BUBBLE_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  bubbleWindow.setIgnoreMouseEvents(true); // pure display, never blocks input
  void bubbleWindow.loadFile(path.join(petRuntimeRoot(), "bubble.html"));
}

export function showBubble(text: string, ms: number): void {
  ensureBubbleWindow();
  if (!bubbleWindow || bubbleWindow.isDestroyed()) return;
  bubbleWindow.webContents.send("bubble:text", text);
  if (petWindow && !petWindow.isDestroyed() && petSize) {
    const [x, y] = petWindow.getPosition();
    bubbleWindow.setBounds({
      x: x + Math.round((petSize.width - BUBBLE_WIDTH) / 2),
      y: y - BUBBLE_HEIGHT - BUBBLE_GAP,
      width: BUBBLE_WIDTH,
      height: BUBBLE_HEIGHT
    });
  }
  bubbleWindow.showInactive();
  clearTimeout(bubbleHideTimer);
  bubbleHideTimer = setTimeout(() => {
    if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.hide();
  }, ms);
}

function hideBubble(): void {
  clearTimeout(bubbleHideTimer);
  bubbleHideTimer = undefined;
  if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.hide();
}

function stopPetStatusForwarding(): void {
  if (!petStatusWatching) return;
  stopPetStatusWatcher();
  petStatusWatching = false;
  lastKnownPiState = "idle";
}

function disposePetWindows(): void {
  stopPetStatusForwarding();
  hideBubble();
  bubbleWindow?.destroy();
  bubbleWindow = undefined;
  petWindow?.destroy();
  petWindow = undefined;
  lastManifest = undefined;
  petSize = undefined;
}

export async function syncPetWindow(settings: KAgentSettings): Promise<void> {
  const activePetId = settings.pet.activePetId;
  if (!settings.pet.enabled || !activePetId) {
    disposePetWindows();
    return;
  }
  const payload = await getPetPayload(activePetId);
  if (!payload) {
    // Active pet missing on disk: switch off gracefully so tray/settings stay consistent.
    disposePetWindows();
    await setSettings({ pet: { enabled: false, activePetId: null } });
    return;
  }
  startPetStatusForwarding();
  const sprite = petSpriteSize(payload.manifest, settings.pet.scale);
  petSize = { width: sprite, height: sprite };
  if (!petWindow || petWindow.isDestroyed()) {
    petWindow = new BrowserWindow({
      width: sprite,
      height: sprite,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(import.meta.dirname, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    }) as PetWindow;
    petWindow.setAlwaysOnTop(true, "screen-saver");
    const position = settings.pet.x !== null && settings.pet.y !== null
      ? { x: Math.round(settings.pet.x), y: Math.round(settings.pet.y) }
      : undefined;
    if (position) petWindow.setPosition(position.x, position.y);
    else petWindow.setPosition(80, 80);
    await petWindow.loadFile(path.join(petRuntimeRoot(), "index.html"), {
      query: { pet: activePetId, sprite: String(sprite) }
    });
  } else if (petWindow.__petId !== activePetId) {
    petWindow.__petId = activePetId;
    await petWindow.loadFile(path.join(petRuntimeRoot(), "index.html"), {
      query: { pet: activePetId, sprite: String(sprite) }
    });
  }
  const [x, y] = petWindow.getPosition();
  movePetWindows(x, y); // asserts exact bounds and keeps the bubble glued on top
  lastManifest = payload.manifest;
  if (!petWindow.isVisible()) petWindow.show();
  petWindow.moveTop();
  petWindow.webContents.send("pet:piState", lastKnownPiState);
}

export function getPetWindow(): PetWindow | undefined {
  return petWindow && !petWindow.isDestroyed() ? petWindow : undefined;
}

export function registerPetIpc(): void {
  ipcMain.on("pet:moveBy", (_event, delta: unknown) => {
    const win = getPetWindow();
    if (!win || !delta || typeof delta !== "object") return;
    const dx = Number((delta as { dx?: unknown }).dx) || 0;
    const dy = Number((delta as { dy?: unknown }).dy) || 0;
    const [x, y] = win.getPosition();
    movePetWindows(x + dx, y + dy);
  });
  ipcMain.handle("pet:moveEnd", async () => {
    const win = getPetWindow();
    if (!win) return;
    const [x, y] = win.getPosition();
    await setSettings({ pet: { x, y } });
  });
  ipcMain.handle("pet:hide", async () => {
    await setSettings({ pet: { enabled: false } });
  });
  ipcMain.handle("pet:say", (_event, text: unknown, ms: unknown) => {
    showBubble(String(text ?? ""), Math.min(10000, Math.max(800, Number(ms) || 2600)));
  });
}

/** Current active pet manifest, handy for future shell-side features. */
export function activePetManifest(): PetManifest | undefined {
  return lastManifest;
}

/** Ensure the pet window reflects the latest settings (called on every settings change). */
export async function refreshPet(): Promise<void> {
  const settings = await getSettings();
  await syncPetWindow(settings);
}

export function startPetStatusForwarding(): void {
  if (!petStatusWatching) {
    startPetStatusWatcher((state) => {
      lastKnownPiState = state;
      const win = getPetWindow();
      if (win && !win.isDestroyed()) win.webContents.send("pet:piState", state);
    });
    petStatusWatching = true;
  }
  // Self-heal: if the display arrangement changed and left the pet unreachable,
  // pull it back into a visible area.
  if (!displayListenerRegistered) {
    screen.on("display-metrics-changed", () => {
      const win = getPetWindow();
      if (!win || !petSize) return;
      const [x, y] = win.getPosition();
      movePetWindows(x, y);
    });
    displayListenerRegistered = true;
  }
}
