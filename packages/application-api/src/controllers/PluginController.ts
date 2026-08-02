import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, requireString } from "../payloadHelpers.js";
import type { PluginDescriptor, PluginHealth } from "@dwm/plugin";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "plugins.list": { payload: Record<string, never>; result: string[] };
    "plugins.get": { payload: { id: string }; result: PluginDescriptor | undefined };
    "plugins.check-health": { payload: { id: string }; result: PluginHealth };
    "plugins.deactivate": { payload: { id: string }; result: { deactivated: true } };
  }
}

/** Módulo 31 — controlador del recurso `plugins`, delega exclusivamente en `@dwm/plugin`. */
export class PluginController implements ApplicationController {
  readonly resource = "plugins";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.pluginManager, "plugin-manager");

    permissions.register("plugins.list", ["read"]);
    operations.register({
      name: "plugins.list",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async () => manager().listPlugins(),
    });

    permissions.register("plugins.get", ["read"]);
    operations.register({
      name: "plugins.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => manager().getPlugin(payload.id),
    });

    permissions.register("plugins.check-health", ["read"]);
    operations.register({
      name: "plugins.check-health",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => manager().checkHealth(payload.id),
    });

    permissions.register("plugins.deactivate", ["configure"], { destructive: true });
    operations.register({
      name: "plugins.deactivate",
      version: "1.0.0",
      capabilities: ["configure"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => {
        await manager().deactivatePlugin(payload.id);
        return { deactivated: true as const };
      },
    });
  }
}
