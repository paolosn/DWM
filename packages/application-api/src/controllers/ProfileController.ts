import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, requireString, optionalString } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import type { Profile, ProfileConfiguration } from "@dwm/profile";

function asProfileConfiguration(
  record: Record<string, unknown>,
  field: string
): ProfileConfiguration {
  const value = record[field];
  if (!value || typeof value !== "object") {
    throw createApplicationError({
      code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
      message: `"${field}" es obligatorio y debe ser un objeto (ProfileConfiguration).`,
      origin: "validation",
      category: "validation",
      retryable: false,
      recoverable: true,
    });
  }
  // Validación de forma real: ProfileManager.createProfile/updateProfile ya
  // llama a validateProfileConfiguration() con el contenido completo — no
  // se duplica esa validación aquí.
  return value as ProfileConfiguration;
}

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "profiles.list": { payload: Record<string, never>; result: string[] };
    "profiles.get": { payload: { id: string }; result: Profile | undefined };
    "profiles.activate": { payload: { id: string }; result: { activated: true } };
    /** Crea un perfil real — delega íntegramente en ProfileManager.createProfile(). */
    "profiles.create": {
      payload: { name: string; description: string; configuration: ProfileConfiguration };
      result: Profile;
    };
    /** Edita un perfil real — delega íntegramente en ProfileManager.updateProfile(). */
    "profiles.update": {
      payload: {
        id: string;
        name?: string;
        description?: string;
        configuration?: ProfileConfiguration;
      };
      result: Profile;
    };
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

    permissions.register("profiles.create", ["write"]);
    operations.register({
      name: "profiles.create",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          name: requireString(record, "name"),
          description: requireString(record, "description"),
          configuration: asProfileConfiguration(record, "configuration"),
        };
      },
      handler: async (payload) =>
        manager().createProfile(payload.name, payload.description, payload.configuration),
    });

    permissions.register("profiles.update", ["write"]);
    operations.register({
      name: "profiles.update",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          id: requireString(record, "id"),
          ...(optionalString(record, "name") !== undefined
            ? { name: optionalString(record, "name")! }
            : {}),
          ...(optionalString(record, "description") !== undefined
            ? { description: optionalString(record, "description")! }
            : {}),
          ...(record["configuration"] !== undefined
            ? { configuration: asProfileConfiguration(record, "configuration") }
            : {}),
        };
      },
      handler: async (payload) => {
        const { id, ...updates } = payload;
        await manager().updateProfile(id, updates);
        const updated = manager().getProfile(id);
        if (!updated) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: `No existe ningún perfil con id "${id}".`,
            origin: "validation",
            category: "not-found",
            retryable: false,
            recoverable: true,
          });
        }
        return updated;
      },
    });
  }
}
