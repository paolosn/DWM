import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, assertSafeOptionalPath, requireString } from "../payloadHelpers.js";
import type {
  InitializeResult,
  WorkspaceRegistryEntry,
  WorkspaceValidationResult,
} from "@dwm/portable-workspace";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "workspace.get": { payload: Record<string, never>; result: WorkspaceRegistryEntry | undefined };
    "workspace.validate": { payload: { root: string }; result: WorkspaceValidationResult };
    "workspace.initialize": { payload: { root?: string }; result: InitializeResult };
    "workspace.register": { payload: { root: string }; result: WorkspaceRegistryEntry };
  }
}

/**
 * Módulo 31 (Módulo 34 — conexión real) — controlador del recurso
 * `workspace`, delega exclusivamente en `@dwm/portable-workspace`. No
 * accede al sistema de archivos directamente.
 *
 * `initialize`/`register` estaban completamente implementadas y probadas
 * en `PortableWorkspaceManager` desde antes de este módulo, pero nunca se
 * habían conectado aquí: sin ellas, no existía ninguna forma de que la UI
 * (Onboarding/Workspaces, Módulo 33B) creara o activara un Workspace — solo
 * podía leerlo o validarlo. Es la conexión de una operación ya existente
 * que exige el Módulo 34 (§2/§6), no una función nueva.
 */
export class WorkspaceController implements ApplicationController {
  readonly resource = "workspace";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () =>
      requireDependency(this.context.portableWorkspaceManager, "portable-workspace-manager");

    permissions.register("workspace.get", ["read"]);
    operations.register({
      name: "workspace.get",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async () => manager().getActiveWorkspace(),
    });

    permissions.register("workspace.validate", ["read"]);
    operations.register({
      name: "workspace.validate",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const root = requireString(record, "root");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { root };
      },
      handler: async (payload) => manager().validateWorkspace(payload.root),
    });

    permissions.register("workspace.initialize", ["write"]);
    operations.register({
      name: "workspace.initialize",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { root: typeof record.root === "string" ? record.root : undefined };
      },
      handler: async (payload) => manager().initializeWorkspace(payload.root),
    });

    permissions.register("workspace.register", ["write"]);
    operations.register({
      name: "workspace.register",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const root = requireString(record, "root");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { root };
      },
      handler: async (payload) => manager().registerActiveWorkspace(payload.root),
    });
  }
}
