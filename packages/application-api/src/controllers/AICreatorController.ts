import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import {
  asRecord,
  assertSafeOptionalPath,
  optionalBoolean,
  optionalString,
} from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import {
  isCreationKind,
  type CreationRequest,
  type CreationOptions,
} from "@dwm/ai-creator-manager";
import type { CreationPreview } from "@dwm/ai-creator-manager";
import type { CreationResult } from "@dwm/ai-creator-manager";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "ai.preview": {
      payload: { request: CreationRequest; options?: CreationOptions };
      result: CreationPreview;
    };
    "ai.create": {
      payload: { request: CreationRequest; options?: CreationOptions };
      result: CreationResult;
    };
  }
}

function assertValidCreationRequest(value: unknown): asserts value is CreationRequest {
  const record = asRecord(value);
  const kind = record["kind"];
  if (!isCreationKind(kind)) {
    throw createApplicationError({
      code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
      message: `El campo "kind" es obligatorio y debe ser uno de los tipos de creación reconocidos.`,
      origin: "validation",
      category: "validation",
      retryable: false,
      recoverable: true,
    });
  }
  if (typeof record["payload"] !== "object" || record["payload"] === null) {
    throw createApplicationError({
      code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
      message: 'El campo "payload" es obligatorio y debe ser un objeto.',
      origin: "validation",
      category: "validation",
      retryable: false,
      recoverable: true,
    });
  }
}

/**
 * Módulo 31 — controlador del recurso `ai`, delega exclusivamente en
 * `@dwm/ai-creator-manager`. No valida en profundidad el contenido de cada
 * tipo de creación (eso ya lo hace `CreationValidator` dentro del manager):
 * solo comprueba que la forma de frontera (`kind` + `payload`) sea válida.
 */
export class AICreatorController implements ApplicationController {
  readonly resource = "ai";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.aiCreatorManager, "ai-creator-manager");

    const validateEnvelope = (
      payload: unknown
    ): { request: CreationRequest; options: CreationOptions } => {
      const record = asRecord(payload);
      assertValidCreationRequest(record["request"]);
      const optionsRecord = asRecord(record["options"] ?? {});
      assertSafeOptionalPath(optionsRecord, "root", { allowAbsolute: true });
      const options: CreationOptions = {
        ...(optionalString(optionsRecord, "root") ? { root: optionsRecord["root"] as string } : {}),
        ...(optionalBoolean(optionsRecord, "dryRun") !== undefined
          ? { dryRun: optionsRecord["dryRun"] as boolean }
          : {}),
      };
      return { request: record["request"] as CreationRequest, options };
    };

    permissions.register("ai.preview", ["read"]);
    operations.register({
      name: "ai.preview",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: validateEnvelope,
      handler: async (payload) => manager().previewCreation(payload.request, payload.options),
    });

    permissions.register("ai.create", ["write"]);
    operations.register({
      name: "ai.create",
      version: "1.0.0",
      capabilities: ["write"],
      long: true,
      validatePayload: validateEnvelope,
      handler: async (payload) => manager().create(payload.request, payload.options),
    });
  }
}
