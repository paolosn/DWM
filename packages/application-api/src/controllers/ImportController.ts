import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import {
  asRecord,
  requireString,
  optionalBoolean,
  optionalStringArray,
} from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import { isImportSourceType } from "@dwm/import-manager";
import type {
  ImportDescriptor,
  ImportRequest,
  ImportResult,
  ImportScanResult,
} from "@dwm/import-manager";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "import.inspect": { payload: ImportRequest; result: ImportScanResult };
    "import.preview": { payload: ImportRequest; result: ImportResult };
    "import.execute": { payload: ImportRequest; result: ImportExecuteResult };
    "import.status": { payload: { id: string }; result: ImportDescriptor | undefined };
    "import.cancel": { payload: { id: string }; result: { cancelled: true } };
  }
}

/**
 * Resultado de `import.execute`: el `ImportResult` real de
 * `@dwm/import-manager` más el estado del reescaneo automático posterior
 * (README §5). `rescanned` es `false` sin que eso deshaga la importación
 * ya completada — el contenido queda importado igualmente; solo indica si
 * `PSNAdapter.scanWorkspace()` pudo ejecutarse después.
 */
export interface ImportExecuteResult extends ImportResult {
  readonly rescanned: boolean;
  readonly rescanWarning?: string;
}

/**
 * Módulo 31 — controlador del recurso `import`, delega exclusivamente en
 * `@dwm/import-manager`. Nunca copia ficheros ni toca el sistema de
 * archivos por sí mismo: `import.inspect`/`import.preview` son operaciones
 * de solo lectura (la segunda ejecuta el pipeline completo en `dryRun`),
 * `import.execute` es la única que escribe físicamente en el Workspace
 * interno, y `import.status`/`import.cancel` consultan y controlan una
 * importación ya iniciada por su `importId`.
 *
 * Reescaneo automático (README §5): tras una `import.execute` que termina
 * en `completed`/`completed_with_warnings`, este controlador orquesta —
 * sin duplicar su lógica — una llamada a `PSNAdapter.scanWorkspace()`
 * (API pública ya existente en `@dwm/psn-adapter`) sobre el destino
 * interno recién importado. Un fallo del reescaneo no deshace la
 * importación: se refleja en `rescanned`/`rescanWarning` para que la UI lo
 * muestre, nunca como un error que oculte el éxito de la copia física.
 */
export class ImportController implements ApplicationController {
  readonly resource = "import";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.importManager, "import-manager");

    const validateImportRequest = (payload: unknown): ImportRequest => {
      const record = asRecord(payload);
      const sourceType = record["sourceType"];
      if (!isImportSourceType(sourceType)) {
        throw createApplicationError({
          code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
          message: 'ImportRequest requiere "sourceType" ("folder", "zip" o "dwm-workspace").',
          origin: "validation",
          category: "validation",
          retryable: false,
          recoverable: true,
        });
      }
      const sourcePath = requireString(record, "sourcePath");
      const destinationRelativePath =
        typeof record["destinationRelativePath"] === "string"
          ? record["destinationRelativePath"]
          : undefined;
      const destinationPath =
        typeof record["destinationPath"] === "string" ? record["destinationPath"] : undefined;
      const overwriteExisting = optionalBoolean(record, "overwriteExisting");
      const dryRun = optionalBoolean(record, "dryRun");
      const excludePatterns = optionalStringArray(record, "excludePatterns");

      return {
        sourceType,
        sourcePath,
        ...(destinationRelativePath !== undefined ? { destinationRelativePath } : {}),
        ...(destinationPath !== undefined ? { destinationPath } : {}),
        ...(overwriteExisting !== undefined ? { overwriteExisting } : {}),
        ...(dryRun !== undefined ? { dryRun } : {}),
        ...(excludePatterns !== undefined ? { excludePatterns } : {}),
      };
    };

    // -----------------------------------------------------------------
    // import.inspect — inventario en bruto del origen (solo lectura).
    // -----------------------------------------------------------------
    permissions.register("import.inspect", ["read", "import"]);
    operations.register({
      name: "import.inspect",
      version: "1.0.0",
      capabilities: ["read", "import"],
      validatePayload: validateImportRequest,
      handler: async (payload) => manager().scanSource(payload),
    });

    // -----------------------------------------------------------------
    // import.preview — pipeline completo en dryRun: origen, destino
    // interno resuelto, conflictos y advertencias, sin escribir nada.
    // -----------------------------------------------------------------
    permissions.register("import.preview", ["read", "import"]);
    operations.register({
      name: "import.preview",
      version: "1.0.0",
      capabilities: ["read", "import"],
      validatePayload: (payload) => {
        const request = validateImportRequest(payload);
        return { ...request, dryRun: true };
      },
      handler: async (payload) => manager().importSource(payload),
    });

    // -----------------------------------------------------------------
    // import.execute — única operación que copia físicamente al
    // Workspace interno administrado por DWM.
    // -----------------------------------------------------------------
    permissions.register("import.execute", ["write", "import"], { destructive: true });
    operations.register({
      name: "import.execute",
      version: "1.0.0",
      capabilities: ["write", "import"],
      destructive: true,
      long: true,
      validatePayload: (payload) => {
        const request = validateImportRequest(payload);
        if (request.dryRun) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: 'import.execute no admite "dryRun": usa import.preview para simular.',
            origin: "validation",
            category: "validation",
            retryable: false,
            recoverable: true,
          });
        }
        return request;
      },
      handler: async (payload): Promise<ImportExecuteResult> => {
        const result = await manager().importSource(payload);
        const succeeded =
          result.state === "completed" || result.state === "completed_with_warnings";
        if (!succeeded) return { ...result, rescanned: false };

        const psnAdapter = this.context.psnAdapter;
        if (!psnAdapter) return { ...result, rescanned: false };

        try {
          await psnAdapter.scanWorkspace(result.destinationPath);
          return { ...result, rescanned: true };
        } catch (err) {
          return {
            ...result,
            rescanned: false,
            rescanWarning: `El reescaneo automático de PSN Adapter falló: ${
              err instanceof Error ? err.message : String(err)
            }`,
          };
        }
      },
    });

    // -----------------------------------------------------------------
    // import.status — estado y progreso de una importación por id.
    // -----------------------------------------------------------------
    permissions.register("import.status", ["read"]);
    operations.register({
      name: "import.status",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { id: requireString(record, "id") };
      },
      handler: async (payload) => manager().getImport(payload.id),
    });

    // -----------------------------------------------------------------
    // import.cancel — solicita cancelación cooperativa de una
    // importación en curso; delega íntegramente en el manager.
    // -----------------------------------------------------------------
    permissions.register("import.cancel", ["write"]);
    operations.register({
      name: "import.cancel",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { id: requireString(record, "id") };
      },
      handler: async (payload) => {
        await manager().cancelImport(payload.id);
        return { cancelled: true as const };
      },
    });
  }
}
