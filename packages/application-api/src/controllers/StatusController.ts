import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, requireString } from "../payloadHelpers.js";
import type { GlobalStatusReport, StatusReport } from "@dwm/status";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "system.status": { payload: Record<string, never>; result: GlobalStatusReport };
    "status.module": { payload: { id: string }; result: StatusReport };
  }
}

/** Módulo 31 — controlador del recurso `status`/`system`, delega exclusivamente en `@dwm/status`. */
export class StatusController implements ApplicationController {
  readonly resource = "status";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.statusManager, "status-manager");

    permissions.register("system.status", ["read"]);
    operations.register({
      name: "system.status",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async () => manager().getGlobalStatus(),
    });

    permissions.register("status.module", ["read"]);
    operations.register({
      name: "status.module",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => manager().getModuleStatus(payload.id),
    });
  }
}
