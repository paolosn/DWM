import type { DWMCore, SystemSnapshot, LifecycleState } from "@dwm/core";
import {
  HostLifecycleState,
  isHostTransitionAllowed,
  COMPOSING_STATES,
} from "./HostLifecycleState.js";
import type { HostConfiguration } from "../config/HostConfiguration.js";
import { CompositionRoot } from "../composition/CompositionRoot.js";
import type { CleanupStack } from "../composition/CleanupStack.js";
import { LifecycleCoordinator } from "../coordinators/LifecycleCoordinator.js";
import { ShutdownCoordinator } from "../coordinators/ShutdownCoordinator.js";
import type { UseCaseCoordinator } from "../coordinators/UseCaseCoordinator.js";
import type { HostStatusReport } from "../status/HostStatusReport.js";
import { HostErrorCode } from "../errors/HostErrorCatalog.js";
import { createHostError } from "../errors/HostError.js";

export type CoreStatusView =
  | { readonly available: false }
  | {
      readonly available: true;
      readonly lifecycleState: LifecycleState;
      readonly snapshot: SystemSnapshot;
    };

export interface HostStatusView {
  readonly hostState: HostLifecycleState;
  readonly core: CoreStatusView;
  readonly lastReport: HostStatusReport;
}

/**
 * Fachada pública de `@dwm/host` (TDS-001 §2.1). Único punto de entrada;
 * una instancia es de un solo uso (TDS-001 §7.6): tras `STOPPED` o `ERROR`
 * no se reinicializa, hay que crear una instancia nueva.
 */
export class ApplicationHost {
  private state: HostLifecycleState = HostLifecycleState.CREATED;
  private core?: DWMCore;
  private cleanupStack?: CleanupStack;
  private coordinators: ReadonlyMap<string, UseCaseCoordinator> = new Map();
  private cancellationRequested = false;
  private lastReport: HostStatusReport = {};

  private readonly compositionRoot = new CompositionRoot();
  private readonly lifecycleCoordinator = new LifecycleCoordinator();
  private readonly shutdownCoordinator = new ShutdownCoordinator();

  private constructor(private readonly config: HostConfiguration) {}

  /** Operación 1 de TDS-001 §15: crea el host en estado CREATED. */
  static create(config: HostConfiguration): ApplicationHost {
    return new ApplicationHost(config);
  }

  getLifecycleState(): HostLifecycleState {
    return this.state;
  }

  /** Operación 2 de TDS-001 §15: ejecuta el orden único de la sección 4. Solo válida desde CREATED. */
  async initialize(): Promise<void> {
    this.assertTransition(HostLifecycleState.VALIDATING_COMPOSITION, "initialize");
    this.transitionTo(HostLifecycleState.VALIDATING_COMPOSITION);

    const result = await this.compositionRoot.run(this.config, () => this.cancellationRequested, {
      onPhase: (phase) => this.transitionTo(phase),
      onCoreCreated: (core) => {
        this.core = core;
      },
    });

    this.cleanupStack = result.cleanupStack;
    this.coordinators = result.coordinators;
    this.lastReport = { ...this.lastReport, composition: result.report };

    if (result.outcome === "ready") {
      this.transitionTo(HostLifecycleState.READY);
      return;
    }

    // "stopped" (cancelación limpia) o "error" (fallo mandatorio o limpieza con fallos).
    this.transitionTo(
      result.outcome === "stopped" ? HostLifecycleState.STOPPED : HostLifecycleState.ERROR
    );
  }

  /** Operación 3 de TDS-001 §15: invoca markRunning() sobre el Core. Solo válida desde READY. */
  start(): void {
    this.assertTransition(HostLifecycleState.RUNNING, "start");
    this.lifecycleCoordinator.start(this.core!);
    this.transitionTo(HostLifecycleState.RUNNING);
  }

  /** Operación 4 de TDS-001 §15 / §13: consulta segura de estado, disponible en cualquier estado. */
  getStatus(): HostStatusView {
    const core: CoreStatusView = this.core
      ? {
          available: true,
          lifecycleState: this.core.getLifecycleState(),
          snapshot: this.core.getSnapshot(),
        }
      : { available: false };

    return { hostState: this.state, core, lastReport: this.lastReport };
  }

  /** Operación 5 de TDS-001 §15: solo disponible en RUNNING. */
  async executeUseCase(useCaseId: string, input: unknown): Promise<unknown> {
    if (this.state !== HostLifecycleState.RUNNING) {
      throw createHostError({
        code: HostErrorCode.HOST_INVALID_STATE_TRANSITION,
        message: `No se puede ejecutar el caso de uso "${useCaseId}": el host no está en RUNNING (estado actual: ${this.state}).`,
        origin: "state",
        recoverable: true,
      });
    }
    const coordinator = this.coordinators.get(useCaseId);
    if (!coordinator) {
      throw createHostError({
        code: HostErrorCode.HOST_COMPONENT_SERVICE_UNAVAILABLE,
        message: `No existe ningún caso de uso disponible con id "${useCaseId}".`,
        origin: "use-case",
        recoverable: true,
      });
    }
    return coordinator.execute(input);
  }

  /**
   * Operación 6 de TDS-001 §15. Si el host todavía está componiendo (TDS-001
   * §8.3), esta llamada registra una cancelación cooperativa en lugar de
   * ejecutar un apagado inmediato: la fase en curso concluye por sí misma y
   * `initialize()` es quien realiza el rollback y transiciona el estado.
   */
  async shutdown(): Promise<void> {
    if (COMPOSING_STATES.has(this.state)) {
      this.cancellationRequested = true;
      return;
    }

    this.assertTransition(HostLifecycleState.SHUTTING_DOWN, "shutdown");
    this.transitionTo(HostLifecycleState.SHUTTING_DOWN);

    const summary = await this.shutdownCoordinator.shutdown(this.core, this.cleanupStack!);
    this.lastReport = { ...this.lastReport, shutdown: summary };

    this.transitionTo(HostLifecycleState.STOPPED);
  }

  /** Operación 7 de TDS-001 §15: disponible incluso tras STOPPED o ERROR. */
  getLastStatusReport(): HostStatusReport {
    return this.lastReport;
  }

  private transitionTo(next: HostLifecycleState): void {
    if (!isHostTransitionAllowed(this.state, next)) {
      throw createHostError({
        code: HostErrorCode.HOST_INVALID_STATE_TRANSITION,
        message: `Transición de estado del host no permitida: ${this.state} → ${next}.`,
        origin: "state",
        recoverable: false,
      });
    }
    this.state = next;
  }

  private assertTransition(target: HostLifecycleState, operation: string): void {
    if (!isHostTransitionAllowed(this.state, target)) {
      throw createHostError({
        code: HostErrorCode.HOST_INVALID_STATE_TRANSITION,
        message: `Operación "${operation}" no disponible en el estado actual del host: ${this.state}.`,
        origin: "state",
        recoverable: true,
      });
    }
  }
}
