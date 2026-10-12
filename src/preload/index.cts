import { contextBridge, ipcRenderer } from "electron";

/**
 * Bridges the native settings window and the pet runtime to the main process.
 * Pi Web itself remains a normal localhost web application and never receives
 * privileged APIs (its pages simply don't use this bridge).
 */
contextBridge.exposeInMainWorld("kAgent", {
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSet: (patch: unknown) => ipcRenderer.invoke("settings:set", patch),
  settingsExport: () => ipcRenderer.invoke("settings:export"),
  settingsImport: () => ipcRenderer.invoke("settings:import"),
  petsList: () => ipcRenderer.invoke("pets:list"),
  petsInstall: () => ipcRenderer.invoke("pets:install"),
  petsRemove: (id: string) => ipcRenderer.invoke("pets:remove", id),
  themesList: () => ipcRenderer.invoke("themes:list"),
  themesInstall: () => ipcRenderer.invoke("themes:install"),
  themesRemove: (id: string) => ipcRenderer.invoke("themes:remove", id),
  petGetData: (id: string) => ipcRenderer.invoke("pet:getData", id),
  petMoveBy: (dx: number, dy: number) => ipcRenderer.send("pet:moveBy", { dx, dy }),
  petMoveEnd: () => ipcRenderer.invoke("pet:moveEnd"),
  petHide: () => ipcRenderer.invoke("pet:hide"),
  petSay: (text: string, ms?: number) => ipcRenderer.invoke("pet:say", text, ms),
  onBubbleText: (callback: (text: string) => void) => {
    ipcRenderer.on("bubble:text", (_event, text: string) => callback(text));
  },
  onPetPiState: (callback: (state: string) => void) => {
    ipcRenderer.on("pet:piState", (_event, state: string) => callback(state));
  },
  networkInfo: () => ipcRenderer.invoke("app:networkInfo"),
  openPath: (which: "logs" | "userData" | "piData") => ipcRenderer.invoke("app:openPath", which),
  onSettingsChanged: (callback: () => void) => {
    ipcRenderer.on("settings:changed", () => callback());
  }
});
