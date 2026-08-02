import type { App, IpcMain } from "electron";
import { dialog } from "electron";
import { EngineBootstrap } from "./engine/EngineBootstrap.js";
import { ConfigurationManager } from "./config/ConfigurationManager.js";
import { WindowManager, type RendererEntry } from "./window/WindowManager.js";
import { IpcRouter } from "./ipc/IpcRouter.js";
import { DesktopLifecycle } from "./lifecycle/DesktopLifecycle.js";
import { GlobalErrorHandler, type ProcessErrorSource } from "./errors/GlobalErrorHandler.js";
import { createDesktopLogger } from "./logging/createDesktopLogger.js";

export interface DesktopAppPaths {
  /** Directorio de datos de usuario (`app.getPath("userData")`). */
  readonly userData: string;
  /** Ruta absoluta al script `preload` compilado. */
  readonly preload: string;
  /** Ruta absoluta al `index.html` del renderer construido. */
  readonly rendererIndexHtml: string;
  /** URL del servidor de desarrollo de Vite; ausente en producción. */
  readonly devServerUrl?: string;
}

export interface BootstrapDesktopAppOptions {
  readonly app: App;
  readonly ipcMain: IpcMain;
  /** Origen de eventos de proceso (normalmente el `process` global; inyectable en pruebas). */
  readonly processRef: ProcessErrorSource;
  readonly paths: DesktopAppPaths;
  readonly appVersion: string;
}

export interface DesktopAppRuntime {
  readonly engine: EngineBootstrap;
  readonly configurationManager: ConfigurationManager;
  readonly windowManager: WindowManager;
  readonly ipcRouter: IpcRouter;
  readonly lifecycle: DesktopLifecycle;
  readonly errorHandler: GlobalErrorHandler;
}

/**
 * Módulo 32 — Desktop Application. Punto único de composición del proceso
 * principal: construye, en orden, el motor DWM, la persistencia de
 * configuración, el gestor de ventanas, el router IPC, el manejo global de
 * errores y el coordinador de ciclo de vida, y abre la ventana principal.
 *
 * Recibe todas sus dependencias externas de Electron (`app`, `ipcMain`,
 * `processRef`) por parámetro para poder probarse íntegramente con dobles
 * de prueba, sin necesidad de un entorno Electron real.
 */
export async function bootstrapDesktopApp(
  options: BootstrapDesktopAppOptions
): Promise<DesktopAppRuntime> {
  const logger = createDesktopLogger();

  const engine = new EngineBootstrap({
    logger,
    dataDir: options.paths.userData,
    dwmVersion: options.appVersion,
  });
  engine.start();
  await engine.awaitReady();

  const configurationManager = new ConfigurationManager({
    directory: options.paths.userData,
    logger,
  });
  const initialConfig = await configurationManager.load();

  const rendererEntry: RendererEntry = options.paths.devServerUrl
    ? { devServerUrl: options.paths.devServerUrl, indexHtmlPath: options.paths.rendererIndexHtml }
    : { indexHtmlPath: options.paths.rendererIndexHtml };

  const windowManager = new WindowManager({
    preloadPath: options.paths.preload,
    rendererEntry,
    logger,
  });

  const allowedOrigins = options.paths.devServerUrl
    ? [options.paths.devServerUrl, "file://"]
    : ["file://"];

  const ipcRouter = new IpcRouter({
    ipcMain: options.ipcMain,
    engine,
    logger,
    appVersion: options.appVersion,
    allowedOrigins,
    dialog: {
      showOpenDialog: (dialogOptions) => {
        const parent = windowManager.getMainWindow();
        return parent
          ? dialog.showOpenDialog(parent, dialogOptions)
          : dialog.showOpenDialog(dialogOptions);
      },
    },
  });
  ipcRouter.register();

  const lifecycle = new DesktopLifecycle({
    app: options.app,
    windowManager,
    configurationManager,
    engine,
    platform: process.platform,
    logger,
  });
  lifecycle.register();

  const errorHandler = new GlobalErrorHandler({
    process: options.processRef,
    app: options.app,
    logger,
    onFatalError: () => {
      void lifecycle.shutdown().finally(() => options.app.quit());
    },
  });
  errorHandler.install();

  await windowManager.openMainWindow({
    bounds: initialConfig.window,
    maximized: initialConfig.windowMaximized,
  });

  return { engine, configurationManager, windowManager, ipcRouter, lifecycle, errorHandler };
}
