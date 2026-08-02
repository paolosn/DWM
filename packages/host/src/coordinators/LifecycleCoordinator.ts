import type { DWMCore } from "@dwm/core";
import { HostErrorCode } from "../errors/HostErrorCatalog.js";
import { HostError } from "../errors/HostError.js";

/**
 * Secuencia, en el orden único de TDS-001 §4, los pasos que involucran
 * directamente al ciclo de vida público del Core que no realiza ya
 * `CompositionRoot` (paso 15: `markRunning()`).
 */
export class LifecycleCoordinator {
  start(core: DWMCore): void {
    try {
      core.markRunning();
    } catch (err) {
      throw HostError.wrap(err, {
        code: HostErrorCode.HOST_INVALID_STATE_TRANSITION,
        origin: "core-bridge",
        recoverable: false,
        message: "Fallo al marcar el Core como en ejecución (markRunning()).",
      });
    }
  }
}
