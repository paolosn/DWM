import type { Logger } from "@dwm/logger";

/** Subconjunto mínimo de `NodeJS.Process` que este módulo necesita, para poder inyectarlo en pruebas. */
export interface ProcessErrorSource {
  on(event: "uncaughtException", listener: (error: Error) => void): unknown;
  on(event: "unhandledRejection", listener: (reason: unknown) => void): unknown;
}

/** Subconjunto mínimo de `Electron.App` relevante para errores de procesos hijos/renderer. */
export interface AppErrorSource {
  on(
    event: "render-process-gone",
    listener: (event: unknown, webContents: unknown, details: unknown) => void
  ): unknown;
  on(event: "child-process-gone", listener: (event: unknown, details: unknown) => void): unknown;
}

export interface GlobalErrorHandlerOptions {
  readonly process: ProcessErrorSource;
  readonly app: AppErrorSource;
  readonly logger?: Logger;
  /**
   * Invocado tras un `uncaughtException`: el proceso principal de Electron
   * queda en un estado no fiable tras una excepción no controlada, así que
   * la única respuesta segura es intentar un cierre ordenado, nunca
   * continuar como si nada hubiera pasado.
   */
  readonly onFatalError: (error: Error) => void;
}

/**
 * Módulo 32 — Desktop Application. Instala manejadores globales de errores
 * no controlados en el proceso principal (excepciones síncronas, promesas
 * rechazadas sin `catch`, caídas del proceso de renderer y de procesos
 * hijos de Electron). Ningún error de este tipo debe cerrar la aplicación
 * en silencio ni dejarla en un estado colgado sin diagnóstico.
 */
export class GlobalErrorHandler {
  private installed = false;

  constructor(private readonly options: GlobalErrorHandlerOptions) {}

  install(): void {
    if (this.installed) return;
    this.installed = true;

    this.options.process.on("uncaughtException", (error) => {
      void this.options.logger?.fatal("Excepción no controlada en el proceso principal.", {
        message: error.message,
      });
      this.options.onFatalError(error);
    });

    this.options.process.on("unhandledRejection", (reason) => {
      void this.options.logger?.error("Promesa rechazada sin gestionar en el proceso principal.", {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
    });

    this.options.app.on("render-process-gone", (_event, _webContents, details) => {
      void this.options.logger?.error("El proceso de renderer ha terminado inesperadamente.", {
        details: this.safeDetails(details),
      });
    });

    this.options.app.on("child-process-gone", (_event, details) => {
      void this.options.logger?.error("Un proceso hijo de Electron ha terminado inesperadamente.", {
        details: this.safeDetails(details),
      });
    });
  }

  isInstalled(): boolean {
    return this.installed;
  }

  private safeDetails(details: unknown): Record<string, unknown> {
    if (typeof details === "object" && details !== null) {
      return details as Record<string, unknown>;
    }
    return { raw: String(details) };
  }
}
