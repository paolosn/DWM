import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, requireString } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import type { BackupDescriptor, BackupRequest, BackupResult, IntegrityResult } from "@dwm/backup";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "backups.create": { payload: BackupRequest; result: BackupResult };
    "backups.list": { payload: Record<string, never>; result: string[] };
    "backups.get": { payload: { id: string }; result: BackupDescriptor | undefined };
    "backups.verify-integrity": { payload: { id: string }; result: IntegrityResult };
    "backups.delete": { payload: { id: string; force?: boolean }; result: { deleted: true } };
  }
}

/**
 * Módulo 31 — controlador del recurso `backups`, delega exclusivamente en
 * `@dwm/backup`. La validación profunda de `BackupRequest` (tipos de
 * recurso, destino, política de retención) sigue viviendo en
 * `BackupValidator`, dentro del propio manager.
 */
export class BackupController implements ApplicationController {
  readonly resource = "backups";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.backupManager, "backup-manager");

    permissions.register("backups.create", ["write", "export"]);
    operations.register({
      name: "backups.create",
      version: "1.0.0",
      capabilities: ["write", "export"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        if (typeof record["type"] !== "string" || !Array.isArray(record["resources"])) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: 'BackupRequest requiere, como mínimo, "type" y "resources".',
            origin: "validation",
            category: "validation",
            retryable: false,
            recoverable: true,
          });
        }
        return payload as BackupRequest;
      },
      handler: async (payload) => manager().createBackup(payload),
    });

    permissions.register("backups.list", ["read"]);
    operations.register({
      name: "backups.list",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async () => manager().listBackups(),
    });

    permissions.register("backups.get", ["read"]);
    operations.register({
      name: "backups.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => manager().getBackup(payload.id),
    });

    permissions.register("backups.verify-integrity", ["read"]);
    operations.register({
      name: "backups.verify-integrity",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => manager().verifyIntegrity(payload.id),
    });

    permissions.register("backups.delete", ["delete"], { destructive: true });
    operations.register({
      name: "backups.delete",
      version: "1.0.0",
      capabilities: ["delete"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const force = record["force"];
        if (force !== undefined && typeof force !== "boolean") {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: 'El campo "force" debe ser booleano si se proporciona.',
            origin: "validation",
            category: "validation",
            retryable: false,
            recoverable: true,
          });
        }
        return { id, ...(typeof force === "boolean" ? { force } : {}) };
      },
      handler: async (payload) => {
        await manager().deleteBackup(payload.id, { force: payload.force ?? false });
        return { deleted: true as const };
      },
    });
  }
}
