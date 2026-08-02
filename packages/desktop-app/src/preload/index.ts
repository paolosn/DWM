import { contextBridge, ipcRenderer } from "electron";
import { createDesktopBridge } from "./createDesktopBridge.js";

/**
 * Módulo 32 — Desktop Application. Punto de entrada real del `preload`.
 * Se ejecuta con `contextIsolation` activo y sin `nodeIntegration`: es el
 * único lugar del renderer con acceso a `ipcRenderer`, y expone
 * exclusivamente la superficie mínima y tipada `window.dwm`
 * (`createDesktopBridge`) mediante `contextBridge.exposeInMainWorld`.
 * Ningún otro objeto de Node o de Electron se expone al renderer.
 */
contextBridge.exposeInMainWorld(
  "dwm",
  createDesktopBridge((channel, ...args) => ipcRenderer.invoke(channel, ...args))
);
