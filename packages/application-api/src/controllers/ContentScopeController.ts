import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { asRecord, optionalString } from "../payloadHelpers.js";
import { resolveContentRoot } from "../resolveContentRoot.js";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    /**
     * Único punto real de resolución de alcance (global/cliente/
     * proyecto) para Agentes/Skills/Reglas. La UI la llama una vez y
     * reutiliza el `root` devuelto tal cual con las operaciones
     * `agents.*`/`skills.*`/`rules.*`/`content-sync.*`/
     * `content-generation.*` ya existentes — nunca se duplica la
     * resolución en el cliente.
     */
    "content-scope.resolve-root": {
      payload: { clientId?: string; projectId?: string };
      result: { root: string };
    };
  }
}

export class ContentScopeController implements ApplicationController {
  readonly resource = "content-scope";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    permissions.register("content-scope.resolve-root", ["read"]);
    operations.register({
      name: "content-scope.resolve-root",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload ?? {});
        return {
          ...(optionalString(record, "clientId") !== undefined
            ? { clientId: optionalString(record, "clientId")! }
            : {}),
          ...(optionalString(record, "projectId") !== undefined
            ? { projectId: optionalString(record, "projectId")! }
            : {}),
        };
      },
      handler: async (payload) => ({ root: await resolveContentRoot(this.context, payload) }),
    });
  }
}
