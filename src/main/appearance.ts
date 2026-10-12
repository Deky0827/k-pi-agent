import type { BrowserWindow, WebContents } from "electron";
import { getActiveThemeCss, type KAgentSettings } from "./store.js";

/**
 * Applies user appearance settings to the Pi Web page:
 * - theme mode ("pi-theme" localStorage key of pi-web; requires one reload on change)
 * - overall zoom factor
 * - active theme package CSS (themes/<id>/theme.css)
 * - user custom CSS (highest priority, inserted last)
 */

const insertedCssKeys = new WeakMap<WebContents, string>();

export async function applyAppearance(window: BrowserWindow, settings: KAgentSettings): Promise<void> {
  const wc = window.webContents;
  try {
    wc.setZoomFactor(clampZoom(settings.ui.zoom));
  } catch {
    // window may be mid-navigation
  }
  try {
    const previousKey = insertedCssKeys.get(wc);
    if (previousKey) await wc.removeInsertedCSS(previousKey);
    insertedCssKeys.delete(wc);
    const themeCss = await getActiveThemeCss();
    const css = [themeCss, settings.ui.customCss].filter(Boolean).join("\n\n");
    if (css) insertedCssKeys.set(wc, await wc.insertCSS(css, { cssOrigin: "author" }));
  } catch {
    // ignore transient navigation errors
  }
}

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1.5, Math.max(0.7, value));
}

/**
 * Persists the theme mode into pi-web's own storage and reloads the page once.
 * pi-web reads localStorage["pi-theme"] on boot (values: light/dark/system);
 * after the first reload the app themes itself, no further shell work needed.
 */
export async function forceThemeMode(window: BrowserWindow, mode: KAgentSettings["theme"]["mode"]): Promise<void> {
  const wc = window.webContents;
  const expected = mode === "system" ? null : mode;
  const script = `(() => {
    const expected = ${JSON.stringify(expected)};
    const current = localStorage.getItem("pi-theme");
    if (expected === null ? current !== null : current !== expected) {
      if (expected === null) localStorage.removeItem("pi-theme");
      else localStorage.setItem("pi-theme", expected);
      return true;
    }
    return false;
  })()`;
  try {
    if (await wc.executeJavaScript(script, true)) wc.reload();
  } catch {
    // window busy or closed; the setting still applies on the next navigation
  }
}
