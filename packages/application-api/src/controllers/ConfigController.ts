import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, requireRecord, requireString } from "../payloadHelpers.js";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "config.list": { payload: Record<string, never>; result: string[] };
    "config.get": { payload: { namespace: string }; result: unknown };
    "config.set": {
      payload: { namespace: string; value: Record<string, unknown> };
      result: { updated: true };
    };
    "config.delete": { payload: { namespace: string }; result: { deleted: true } };
  }
}

const RESERVED_NAMESPACE_PREFIX = "application-api";

/**
 * Módulo 31 — controlador del recurso `config`, delega exclusivamente en
 * `@dwm/config`. No expone nunca `secrets` (eso vive en `@dwm/secrets`, no
 * integrado aquí) ni permite tocar el namespace reservado del propio
 * módulo de aplicación.
 */
export class ConfigController implements ApplicationController {
  readonly resource = "config";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.configManager, "config-manager");

    permissions.register("config.list", ["read"]);
    operations.register({
      name: "config.list",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async () => manager().listNamespaces(),
    });

    permissions.register("config.get", ["read"]);
    operations.register({
      name: "config.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const namespace = requireString(record, "namespace");
        return { namespace };
      },
      handler: async (payload) => manager().getSection(payload.namespace),
    });

    permissions.register("config.set", ["configure"], { destructive: true });
    operations.register({
      name: "config.set",
      version: "1.0.0",
      capabilities: ["configure"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const namespace = requireString(record, "namespace");
        if (namespace === RESERVED_NAMESPACE_PREFIX) {
          throw new Error('El namespace "application-api" está reservado y no es modificable.');
        }
        const value = requireRecord(record, "value");
        return { namespace, value };
      },
      handler: async (payload) => {
        await manager().setSection(payload.namespace, payload.value);
        return { updated: true as const };
      },
    });

    permissions.register("config.delete", ["configure", "delete"], { destructive: true });
    operations.register({
      name: "config.delete",
      version: "1.0.0",
      capabilities: ["configure", "delete"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const namespace = requireString(record, "namespace");
        return { namespace };
      },
      handler: async (payload) => {
        await manager().deleteSection(payload.namespace);
        return { deleted: true as const };
      },
    });
  }
}
