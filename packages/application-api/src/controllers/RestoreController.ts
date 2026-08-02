import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, requireString } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import type { RestoreDescriptor, RestoreRequest, RestoreResult } from "@dwm/restore";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "restore.execute": { payload: RestoreRequest; result: RestoreResult };
    "restore.list": { payload: Record<string, never>; result: string[] };
    "restore.get": { payload: { id: string }; result: RestoreDescriptor | undefined };
  }
}

/**
 * Módulo 31 — controlador del recurso `restore`, delega exclusivamente en
 * `@dwm/restore`. Restaurar es, por definición, una operación destructiva
 * (puede sobrescribir recursos existentes): exige confirmación explícita.
 */
export class RestoreController implements ApplicationController {
  readonly resource = "restore";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.restoreManager, "restore-manager");

    permissions.register("restore.execute", ["restore"], { destructive: true });
    operations.register({
      name: "restore.execute",
      version: "1.0.0",
      capabilities: ["restore"],
      destructive: true,
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        if (typeof record["backupId"] !== "string" || record["backupId"].length === 0) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: 'RestoreRequest requiere "backupId".',
            origin: "validation",
            category: "validation",
            retryable: false,
            recoverable: true,
          });
        }
        return payload as RestoreRequest;
      },
      handler: async (payload) => manager().restoreBackup(payload),
    });

    permissions.register("restore.list", ["read"]);
    operations.register({
      name: "restore.list",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async () => manager().listRestores(),
    });

    permissions.register("restore.get", ["read"]);
    operations.register({
      name: "restore.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => manager().getRestore(payload.id),
    });
  }
}
