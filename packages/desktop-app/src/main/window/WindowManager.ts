import { BrowserWindow, shell } from "electron";
import type { Logger } from "@dwm/logger";
import type { DesktopWindowBounds } from "../../shared/types/DesktopConfig.js";

export interface RendererEntry {
  /** URL del servidor de desarrollo de Vite (solo en `npm run dev`). Ausente en producción. */
  readonly devServerUrl?: string;
  /** Ruta absoluta al `index.html` construido del renderer (producción). */
  readonly indexHtmlPath: string;
}

export interface WindowManagerOptions {
  readonly preloadPath: string;
  readonly rendererEntry: RendererEntry;
  readonly logger?: Logger;
  /** Punto de inyección para pruebas: por defecto crea un `BrowserWindow` real. */
  readonly createWindow?: (options: Electron.BrowserWindowConstructorOptions) => BrowserWindow;
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["https:", "mailto:"]);

/**
 * Módulo 32 — Desktop Application. Único componente que crea y gestiona
 * ventanas `BrowserWindow`. Aplica la configuración de seguridad exigida
 * (README §Seguridad / ADR de Electron): sin `nodeIntegration`, con
 * `contextIsolation`, `sandbox` y `preload` seguro; niega la apertura de
 * nuevas ventanas arbitrarias y solo permite navegación externa a
 * protocolos seguros mediante el navegador del sistema, nunca dentro de la
 * propia ventana de la aplicación.
 */
export class WindowManager {
  private mainWindow: BrowserWindow | undefined;
  private readonly preloadPath: string;
  private readonly rendererEntry: RendererEntry;
  private readonly logger?: Logger;
  private readonly createWindow: (
    options: Electron.BrowserWindowConstructorOptions
  ) => BrowserWindow;

  constructor(options: WindowManagerOptions) {
    this.preloadPath = options.preloadPath;
    this.rendererEntry = options.rendererEntry;
    if (options.logger) this.logger = options.logger;
    this.createWindow = options.createWindow ?? ((opts) => new BrowserWindow(opts));
  }

  getMainWindow(): BrowserWindow | undefined {
    return this.mainWindow;
  }

  hasOpenWindow(): boolean {
    return this.mainWindow !== undefined && !this.mainWindow.isDestroyed();
  }

  /**
   * Crea la ventana principal si no existe (o ya fue destruida); si ya hay
   * una abierta, la enfoca en lugar de crear una segunda. Idempotente por
   * diseño: `activate` en macOS y el arranque inicial pueden llamarla sin
   * duplicar ventanas.
   */
  async openMainWindow(initial: {
    bounds: DesktopWindowBounds;
    maximized: boolean;
  }): Promise<BrowserWindow> {
    if (this.hasOpenWindow()) {
      this.mainWindow!.focus();
      return this.mainWindow!;
    }

    const window = this.createWindow({
      ...(initial.bounds.x !== undefined ? { x: initial.bounds.x } : {}),
      ...(initial.bounds.y !== undefined ? { y: initial.bounds.y } : {}),
      width: initial.bounds.width,
      height: initial.bounds.height,
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    this.mainWindow = window;

    window.webContents.setWindowOpenHandler((details) => {
      void this.logger?.warn(
        "Bloqueada la apertura de una nueva ventana solicitada por el renderer.",
        {
          url: details.url,
        }
      );
      return { action: "deny" };
    });

    window.webContents.on("will-navigate", (event, url) => {
      if (this.rendererEntry.devServerUrl && url.startsWith(this.rendererEntry.devServerUrl))
        return;
      event.preventDefault();
      void this.openExternalIfAllowed(url);
    });

    window.on("closed", () => {
      if (this.mainWindow === window) this.mainWindow = undefined;
    });

    window.once("ready-to-show", () => {
      if (initial.maximized) window.maximize();
      window.show();
    });

    if (this.rendererEntry.devServerUrl) {
      await window.loadURL(this.rendererEntry.devServerUrl);
    } else {
      await window.loadFile(this.rendererEntry.indexHtmlPath);
    }

    return window;
  }

  /** Lee el estado actual de la ventana principal para poder persistirlo. */
  getCurrentWindowState(): { bounds: DesktopWindowBounds; maximized: boolean } | undefined {
    if (!this.hasOpenWindow()) return undefined;
    const window = this.mainWindow!;
    const maximized = window.isMaximized();
    // getBounds() de una ventana maximizada refleja el tamaño de pantalla,
    // no el tamaño "restaurado" deseable a persistir; getNormalBounds()
    // conserva el último tamaño no maximizado en todas las plataformas.
    const bounds = maximized ? window.getNormalBounds() : window.getBounds();
    return { bounds, maximized };
  }

  closeAll(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close();
    }
    this.mainWindow = undefined;
  }

  private async openExternalIfAllowed(url: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      void this.logger?.warn("Bloqueada la navegación a un protocolo no permitido.", { url });
      return;
    }
    await shell.openExternal(url);
  }
}
