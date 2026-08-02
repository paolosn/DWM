import {
  ApplicationAPI,
  type ApplicationRequest,
  type ApplicationResponse,
} from "@dwm/application-api";
import type { Logger } from "@dwm/logger";
import { composeManagers } from "./ManagerComposition.js";

export interface EngineBootstrapOptions {
  readonly logger?: Logger;
  /**
   * Módulo 34. Cuando se provee, `start()` conecta los managers de dominio
   * reales (ver `ManagerComposition.ts`) antes de aceptar peticiones. Se
   * omite en las pruebas existentes del Módulo 32 para mantener su
   * comportamiento exacto (motor arrancado sin managers, cada operación
   * responde `APP_DEPENDENCY_UNAVAILABLE`).
   */
  readonly dataDir?: string;
  readonly workspaceStartDir?: string;
  readonly dwmVersion?: string;
}

/**
 * Módulo 32 (Módulo 34 — integración real) — `EngineBootstrap` es el único
 * punto del proceso principal que sabe construir el "motor DWM": una
 * instancia de `ApplicationAPI` (Módulo 31), la capa pública y estable que
 * el resto del proceso principal (el `IpcRouter`) usa para atender
 * cualquier petición del renderer.
 *
 * Cuando se provee `dataDir`, `start()` conecta los managers de dominio
 * reales vía `composeManagers()` antes de marcar el motor como arrancado:
 * es la conexión que el Módulo 32 dejó pendiente a propósito y que el
 * Módulo 34 resuelve. Sin `dataDir` (comportamiento exacto del Módulo 32),
 * `ApplicationAPI` sigue sin ningún manager conectado y cualquier
 * operación que dependa de uno ausente responde con el error normalizado
 * `APP_DEPENDENCY_UNAVAILABLE` en lugar de fallar de forma inesperada.
 */
export class EngineBootstrap {
  private api: ApplicationAPI;
  private started = false;
  private disposed = false;
  private startingPromise: Promise<void> | undefined;
  private workspaceLocatedAtStartup = false;

  constructor(private readonly options: EngineBootstrapOptions = {}) {
    this.api = new ApplicationAPI(options.logger ? { logger: options.logger } : {});
  }

  /**
   * Idempotente: si ya se está arrancando o ya arrancó, no repite trabajo.
   * Con `dataDir`, esta llamada es asíncrona en la práctica (conecta los
   * managers reales); `start()` en sí sigue siendo síncrona por
   * compatibilidad — usa `awaitReady()` para esperar a que la conexión
   * real termine antes de aceptar tráfico.
   */
  start(): void {
    if (this.disposed) {
      throw new Error("No se puede arrancar el motor DWM: ya ha sido cerrado (dispose()).");
    }
    if (this.started || this.startingPromise) return;
    this.started = true;

    if (this.options.dataDir) {
      this.startingPromise = composeManagers({
        dataDir: this.options.dataDir,
        workspaceStartDir: this.options.workspaceStartDir ?? this.options.dataDir,
        dwmVersion: this.options.dwmVersion ?? "1.0.0",
        ...(this.options.logger ? { logger: this.options.logger } : {}),
      }).then((result) => {
        this.workspaceLocatedAtStartup = result.workspaceLocated;
        this.api = new ApplicationAPI({
          ...(this.options.logger ? { logger: this.options.logger } : {}),
          ...result.context,
        });
      });
    }
  }

  /** Espera a que, si `dataDir` fue provisto, los managers reales terminen de conectarse. */
  async awaitReady(): Promise<void> {
    if (this.startingPromise) await this.startingPromise;
  }

  /** `true` si, al arrancar, se localizó y registró un Workspace portable existente. */
  wasWorkspaceLocatedAtStartup(): boolean {
    return this.workspaceLocatedAtStartup;
  }

  isRunning(): boolean {
    return this.started && !this.disposed;
  }

  /** Único punto de acceso a la Application API desde el resto del proceso principal. */
  async execute(request: ApplicationRequest): Promise<ApplicationResponse> {
    if (!this.isRunning()) {
      throw new Error("El motor DWM no está arrancado: llama a start() antes de execute().");
    }
    if (this.startingPromise) await this.startingPromise;
    return this.api.execute(request);
  }

  getVersion(): ReturnType<ApplicationAPI["getVersion"]> {
    return this.api.getVersion();
  }

  /** Cierre seguro: tras `dispose()` el motor deja de aceptar nuevas peticiones. */
  dispose(): void {
    this.started = false;
    this.disposed = true;
  }
}
