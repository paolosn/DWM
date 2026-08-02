import type { Logger } from "@dwm/logger";
import type {
  DesktopConfiguration,
  DesktopWindowBounds,
} from "../../shared/types/DesktopConfig.js";

export interface LifecycleAppSource {
  on(event: "window-all-closed", listener: () => void): unknown;
  on(event: "activate", listener: () => void): unknown;
  on(event: "before-quit", listener: () => void): unknown;
  quit(): void;
}

export interface LifecycleWindowManager {
  hasOpenWindow(): boolean;
  openMainWindow(initial: { bounds: DesktopWindowBounds; maximized: boolean }): Promise<unknown>;
  getCurrentWindowState(): { bounds: DesktopWindowBounds; maximized: boolean } | undefined;
  closeAll(): void;
}

export interface LifecycleConfigurationManager {
  getCurrent(): DesktopConfiguration;
  save(patch: Partial<DesktopConfiguration>): Promise<DesktopConfiguration>;
}

export interface LifecycleEngine {
  dispose(): void;
}

export interface DesktopLifecycleOptions {
  readonly app: LifecycleAppSource;
  readonly windowManager: LifecycleWindowManager;
  readonly configurationManager: LifecycleConfigurationManager;
  readonly engine: LifecycleEngine;
  readonly platform: NodeJS.Platform;
  readonly logger?: Logger;
}

/**
 * Módulo 32 — Desktop Application. Coordina el ciclo de vida completo de la
 * aplicación de escritorio (TDS-style: creación, activación, cierre
 * ordenado), siguiendo las convenciones estándar de Electron:
 *
 *  - `window-all-closed`: en macOS la aplicación permanece activa (dock)
 *    sin ventanas; en el resto de plataformas se cierra.
 *  - `activate` (solo relevante en macOS): si se reactiva la app sin
 *    ninguna ventana abierta, se vuelve a abrir la principal.
 *  - `before-quit`: cierre seguro — persiste el estado de ventana actual y
 *    libera el motor DWM (`EngineBootstrap.dispose()`) antes de que el
 *    proceso termine.
 */
export class DesktopLifecycle {
  private shuttingDown = false;

  constructor(private readonly options: DesktopLifecycleOptions) {}

  register(): void {
    this.options.app.on("window-all-closed", () => {
      if (this.options.platform !== "darwin") {
        this.options.app.quit();
      }
    });

    this.options.app.on("activate", () => {
      if (!this.options.windowManager.hasOpenWindow()) {
        const current = this.options.configurationManager.getCurrent();
        void this.options.windowManager.openMainWindow({
          bounds: current.window,
          maximized: current.windowMaximized,
        });
      }
    });

    this.options.app.on("before-quit", () => {
      void this.shutdown();
    });
  }

  /** Cierre ordenado, idempotente: persiste ventana, cierra ventanas y libera el motor. */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    const state = this.options.windowManager.getCurrentWindowState();
    if (state) {
      await this.options.configurationManager.save({
        window: state.bounds,
        windowMaximized: state.maximized,
      });
    }

    this.options.windowManager.closeAll();
    this.options.engine.dispose();
    void this.options.logger?.info("Cierre ordenado del shell Desktop completado.");
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }
}
