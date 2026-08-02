import type { DWMCore } from "@dwm/core";
import type { CleanupStack } from "../composition/CleanupStack.js";
import type { ShutdownReportSummary } from "../status/HostStatusReport.js";

/**
 * Secuencia el apagado normal (TDS-001 §2.7): invoca `DWMCore.shutdown()`,
 * libera las dependencias externas propias del host que aún quedaran en la
 * pila de limpieza, y agrega ambos resultados en un único resumen.
 */
export class ShutdownCoordinator {
  async shutdown(
    core: DWMCore | undefined,
    cleanupStack: CleanupStack
  ): Promise<ShutdownReportSummary> {
    const coreReport = core ? await core.shutdown() : undefined;
    const cleanupResult = await cleanupStack.unwind();
    return {
      ...(coreReport ? { core: coreReport } : {}),
      externalDependencyFailures: cleanupResult.failures,
    };
  }
}
