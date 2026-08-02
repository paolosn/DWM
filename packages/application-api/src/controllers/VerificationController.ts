import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, optionalBoolean, requireString } from "../payloadHelpers.js";
import type {
  VerificationDescriptor,
  VerificationRequest,
  VerificationResult,
} from "@dwm/verification";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "verification.run": { payload: VerificationRequest; result: VerificationResult };
    "verification.list": { payload: Record<string, never>; result: string[] };
    "verification.get": { payload: { id: string }; result: VerificationDescriptor | undefined };
  }
}

/** Módulo 31 — controlador del recurso `verification`, delega exclusivamente en `@dwm/verification`. */
export class VerificationController implements ApplicationController {
  readonly resource = "verification";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () =>
      requireDependency(this.context.verificationManager, "verification-manager");

    permissions.register("verification.run", ["execute"]);
    operations.register({
      name: "verification.run",
      version: "1.0.0",
      capabilities: ["execute"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload ?? {});
        const dryRun = optionalBoolean(record, "dryRun");
        return { ...(dryRun !== undefined ? { dryRun } : {}) };
      },
      handler: async (payload) => manager().verify(payload),
    });

    permissions.register("verification.list", ["read"]);
    operations.register({
      name: "verification.list",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async () => manager().listVerifications(),
    });

    permissions.register("verification.get", ["read"]);
    operations.register({
      name: "verification.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => manager().getVerification(payload.id),
    });
  }
}
