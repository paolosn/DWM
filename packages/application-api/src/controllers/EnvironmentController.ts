import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, optionalBoolean } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import type {
  EnvironmentRequirement,
  EnvironmentSummary,
  EnvironmentValidationResult,
  ToolResult,
} from "@dwm/environment-manager";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "environment.inspect": { payload: { force?: boolean }; result: EnvironmentSummary };
    "environment.list-tools": { payload: { force?: boolean }; result: readonly ToolResult[] };
    "environment.validate": {
      payload: { requirements: readonly EnvironmentRequirement[] };
      result: EnvironmentValidationResult;
    };
  }
}

function isRequirementArray(value: unknown): value is EnvironmentRequirement[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { toolId?: unknown }).toolId === "string"
    )
  );
}

/** Módulo 31 — controlador del recurso `environment`, delega exclusivamente en `@dwm/environment-manager`. */
export class EnvironmentController implements ApplicationController {
  readonly resource = "environment";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.environmentManager, "environment-manager");

    permissions.register("environment.inspect", ["read"]);
    operations.register({
      name: "environment.inspect",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload ?? {});
        const force = optionalBoolean(record, "force");
        return { ...(force !== undefined ? { force } : {}) };
      },
      handler: async (payload) => manager().inspect(payload),
    });

    permissions.register("environment.list-tools", ["read"]);
    operations.register({
      name: "environment.list-tools",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload ?? {});
        const force = optionalBoolean(record, "force");
        return { ...(force !== undefined ? { force } : {}) };
      },
      handler: async (payload) => manager().listTools(payload),
    });

    permissions.register("environment.validate", ["read"]);
    operations.register({
      name: "environment.validate",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const requirements = record["requirements"];
        if (!isRequirementArray(requirements)) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message:
              'El campo "requirements" es obligatorio y debe ser un array de EnvironmentRequirement.',
            origin: "validation",
            category: "validation",
            retryable: false,
            recoverable: true,
          });
        }
        return { requirements };
      },
      handler: async (payload) => manager().validateRequirements(payload.requirements),
    });
  }
}
