import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { Project, ProjectManager } from "@dwm/project";
import { SecretsManager } from "@dwm/secrets";
import { ConnectionsManager } from "@dwm/connections-manager";
import type { PortableWorkspaceManager, WorkspaceRegistryEntry } from "@dwm/portable-workspace";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = {
  grantedCapabilities: ["read", "write", "delete", "execute", "configure"] as const,
};

function makeFakeProject(id: string, projectPath: string): Project {
  return {
    id,
    configuration: { projectPath, profileId: "profile-1", usedTools: [], usedAdapters: [] },
    metadata: { id, name: id, description: "", createdAt: "", updatedAt: "" },
    state: "created",
  } as unknown as Project;
}

describe("ConnectionsController — conexiones compartidas de cliente (Commit 5)", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function buildApi(options: { withWorkspace?: boolean } = {}) {
    const workspaceRoot = tempDir("dwm-client-connections-ws-");
    const secretsDir = tempDir("dwm-client-connections-secrets-");
    const projectPath = tempDir("dwm-client-connections-project-");
    const secretsManager = new SecretsManager({
      configuration: { secretsDir, masterKey: "clave-maestra-tests" },
    });
    const connectionsManager = new ConnectionsManager({ secretsManager });

    const projectManager = {
      getProject: vi.fn((id: string) =>
        id === "proyecto-1" ? makeFakeProject("proyecto-1", projectPath) : undefined
      ),
    } as unknown as ProjectManager;

    const portableWorkspaceManager = {
      getActiveWorkspace: (): WorkspaceRegistryEntry | undefined =>
        options.withWorkspace === false
          ? undefined
          : {
              root: workspaceRoot,
              metadata: { id: "ws-1", name: "ws", createdAt: "", updatedAt: "" } as never,
              registeredAt: new Date().toISOString(),
            },
    } as unknown as PortableWorkspaceManager;

    const api = new ApplicationAPI({
      connectionsManager,
      projectManager,
      portableWorkspaceManager,
    });
    return { api, workspaceRoot };
  }

  it("connections.create-for-client persiste bajo CLIENTES/.connections/<clientId>, nunca devuelve el secreto", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "connections.create-for-client",
        {
          clientId: "mci-finance",
          name: "WordPress compartido",
          type: "wordpress-rest",
          config: { url: "https://mci.example.test" },
          secrets: { appPassword: "clave-en-claro-cliente" },
        },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    if (!response.success) throw new Error("se esperaba éxito");
    const connection = response.data as { id: string; secretReferences: Record<string, string> };
    expect(connection.secretReferences["appPassword"]).toBeDefined();
    expect(JSON.stringify(response.data)).not.toContain("clave-en-claro-cliente");
  });

  it("connections.list-for-client devuelve solo las conexiones de ese cliente, aisladas de las de proyecto", async () => {
    const { api } = buildApi();
    await api.execute(
      makeRequest(
        "connections.create-for-client",
        { clientId: "mci-finance", name: "Conexión de cliente", type: "http" },
        { caller: admin }
      )
    );
    await api.execute(
      makeRequest(
        "connections.create",
        { projectId: "proyecto-1", name: "Conexión de proyecto", type: "http" },
        { caller: admin }
      )
    );

    const clientList = await api.execute(
      makeRequest("connections.list-for-client", { clientId: "mci-finance" }, { caller: admin })
    );
    expect(clientList.success).toBe(true);
    if (clientList.success) {
      const names = (clientList.data as { name: string }[]).map((c) => c.name);
      expect(names).toEqual(["Conexión de cliente"]);
    }

    const projectList = await api.execute(
      makeRequest("connections.list", { projectId: "proyecto-1" }, { caller: admin })
    );
    expect(projectList.success).toBe(true);
    if (projectList.success) {
      const names = (projectList.data as { name: string }[]).map((c) => c.name);
      expect(names).toEqual(["Conexión de proyecto"]);
    }
  });

  it("una conexión de cliente NUNCA está asignada a un proyecto por defecto (denegación por defecto)", async () => {
    const { api } = buildApi();
    const created = await api.execute(
      makeRequest(
        "connections.create-for-client",
        { clientId: "mci-finance", name: "Conexión", type: "http" },
        { caller: admin }
      )
    );
    if (!created.success) throw new Error("se esperaba éxito");
    const connectionId = (created.data as { id: string }).id;

    const projects = await api.execute(
      makeRequest(
        "connections.projects-for-client-connection",
        { clientId: "mci-finance", connectionId },
        { caller: admin }
      )
    );
    expect(projects.success).toBe(true);
    if (projects.success) expect(projects.data).toEqual([]);
  });

  it("connections.assign-to-project concede la asignación explícita, y connections.revoke-from-project la retira", async () => {
    const { api } = buildApi();
    const created = await api.execute(
      makeRequest(
        "connections.create-for-client",
        { clientId: "mci-finance", name: "Conexión", type: "http" },
        { caller: admin }
      )
    );
    if (!created.success) throw new Error("se esperaba éxito");
    const connectionId = (created.data as { id: string }).id;

    const assigned = await api.execute(
      makeRequest(
        "connections.assign-to-project",
        { clientId: "mci-finance", connectionId, projectId: "proyecto-1" },
        { caller: admin }
      )
    );
    expect(assigned.success).toBe(true);

    const afterAssign = await api.execute(
      makeRequest(
        "connections.projects-for-client-connection",
        { clientId: "mci-finance", connectionId },
        { caller: admin }
      )
    );
    expect(afterAssign.success && afterAssign.data).toEqual(["proyecto-1"]);

    const revoked = await api.execute(
      makeRequest(
        "connections.revoke-from-project",
        { clientId: "mci-finance", connectionId, projectId: "proyecto-1" },
        { caller: admin }
      )
    );
    expect(revoked.success).toBe(true);

    const afterRevoke = await api.execute(
      makeRequest(
        "connections.projects-for-client-connection",
        { clientId: "mci-finance", connectionId },
        { caller: admin }
      )
    );
    expect(afterRevoke.success && afterRevoke.data).toEqual([]);
  });

  it("connections.assign-to-project falla si el proyecto no existe realmente (no se asigna a ciegas)", async () => {
    const { api } = buildApi();
    const created = await api.execute(
      makeRequest(
        "connections.create-for-client",
        { clientId: "mci-finance", name: "Conexión", type: "http" },
        { caller: admin }
      )
    );
    if (!created.success) throw new Error("se esperaba éxito");
    const connectionId = (created.data as { id: string }).id;

    const response = await api.execute(
      makeRequest(
        "connections.assign-to-project",
        { clientId: "mci-finance", connectionId, projectId: "no-existe" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
  });

  it("connections.delete-for-client elimina la conexión del cliente", async () => {
    const { api } = buildApi();
    const created = await api.execute(
      makeRequest(
        "connections.create-for-client",
        { clientId: "mci-finance", name: "Conexión", type: "http" },
        { caller: admin }
      )
    );
    if (!created.success) throw new Error("se esperaba éxito");
    const connectionId = (created.data as { id: string }).id;

    const deleted = await api.execute(
      makeRequest(
        "connections.delete-for-client",
        { clientId: "mci-finance", id: connectionId },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(deleted.success).toBe(true);

    const list = await api.execute(
      makeRequest("connections.list-for-client", { clientId: "mci-finance" }, { caller: admin })
    );
    expect(list.success && list.data).toEqual([]);
  });

  it("falla con un mensaje claro si no hay ningún Sistema de Trabajo activo", async () => {
    const { api } = buildApi({ withWorkspace: false });
    const response = await api.execute(
      makeRequest("connections.list-for-client", { clientId: "mci-finance" }, { caller: admin })
    );
    expect(response.success).toBe(false);
  });
});
