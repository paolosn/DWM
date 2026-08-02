import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, requireString } from "../payloadHelpers.js";
import type { Profile } from "@dwm/profile";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "profiles.list": { payload: Record<string, never>; result: string[] };
    "profiles.get": { payload: { id: string }; result: Profile | undefined };
    "profiles.activate": { payload: { id: string }; result: { activated: true } };
  }
}

/** Módulo 31 — controlador del recurso `profiles`, delega exclusivamente en `@dwm/profile`. */
export class ProfileController implements ApplicationController {
  readonly resource = "profiles";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.profileManager, "profile-manager");

    permissions.register("profiles.list", ["read"]);
    operations.register({
      name: "profiles.list",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async () => manager().listProfiles(),
    });

    permissions.register("profiles.get", ["read"]);
    operations.register({
      name: "profiles.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => manager().getProfile(payload.id),
    });

    permissions.register("profiles.activate", ["configure"]);
    operations.register({
      name: "profiles.activate",
      version: "1.0.0",
      capabilities: ["configure"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => {
        await manager().activateProfile(payload.id);
        return { activated: true as const };
      },
    });
  }
}
