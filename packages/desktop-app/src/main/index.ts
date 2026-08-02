import { app, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bootstrapDesktopApp, type DesktopAppRuntime } from "./bootstrap.js";

/**
 * Módulo 32 — Desktop Application. Punto de entrada real del proceso
 * principal de Electron. Deliberadamente mínimo: toda la lógica
 * componible y testeable vive en `bootstrap.ts` y en las clases que este
 * archivo se limita a invocar con las dependencias reales de Electron
 * (`app`, `ipcMain`, `process`). No se incluye en la cobertura de pruebas
 * unitarias por la misma razón que un `main()` de CLI no suele
 * verificarse con pruebas unitarias: requiere un proceso Electron real.
 */

const currentDir = dirname(fileURLToPath(import.meta.url));

// En desarrollo, Vite expone su servidor mediante esta variable de entorno
// (ver `electron.vite` / scripts `dev`); en producción está ausente y se
// carga el `index.html` construido.
const devServerUrl = process.env.DWM_DESKTOP_DEV_SERVER_URL;

let runtime: DesktopAppRuntime | undefined;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = runtime?.windowManager.getMainWindow();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  app.whenReady().then(() => {
    void bootstrapDesktopApp({
      app,
      ipcMain,
      processRef: process,
      appVersion: app.getVersion(),
      paths: {
        userData: app.getPath("userData"),
        preload: join(currentDir, "../preload/index.js"),
        rendererIndexHtml: join(currentDir, "../../dist-renderer/index.html"),
        icon: join(currentDir, "../../build/icon.png"),
        ...(devServerUrl ? { devServerUrl } : {}),
      },
    }).then((result) => {
      runtime = result;
    });
  });
}
