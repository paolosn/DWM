import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { Project, ProjectManager } from "@dwm/project";
import { SecretsManager } from "@dwm/secrets";
import { ConnectionsManager } from "@dwm/connections-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = {
  grantedCapabilities: [
    "read",
    "write",
    "delete",
    "archive",
    "restore",
    "execute",
    "configure",
  ] as const,
};

function makeFakeProject(id: string, projectPath: string): Project {
  return {
    id,
    configuration: { projectPath, profileId: "profile-1", usedTools: [], usedAdapters: [] },
    metadata: { id, name: id, description: "", createdAt: "", updatedAt: "" },
    state: "created",
  } as unknown as Project;
}

describe("ConnectionsController", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function buildApi(
    options: { withProjectManager?: boolean; withConnectionsManager?: boolean } = {}
  ) {
    const projectPath = tempDir("dwm-connections-controller-project-");
    const secretsDir = tempDir("dwm-connections-controller-secrets-");
    const secretsManager = new SecretsManager({
      configuration: { secretsDir, masterKey: "clave-maestra-controller-tests" },
    });
    const connectionsManager = new ConnectionsManager({ secretsManager });

    const fakeProjectManager = {
      getProject: vi.fn((id: string) =>
        id === "proyecto-1" ? makeFakeProject("proyecto-1", projectPath) : undefined
      ),
    } as unknown as ProjectManager;

    const api = new ApplicationAPI({
      ...(options.withConnectionsManager !== false ? { connectionsManager } : {}),
      ...(options.withProjectManager !== false ? { projectManager: fakeProjectManager } : {}),
    });

    return { api, connectionsManager, fakeProjectManager, projectPath };
  }

  it("connections.create valida el payload y delega en el manager, sin devolver el valor del secreto", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "connections.create",
        {
          projectId: "proyecto-1",
          name: "WordPress Producción",
          type: "wordpress-rest",
          config: { url: "https://example.test" },
          secrets: { appPassword: "clave-en-claro" },
        },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    if (!response.success) throw new Error("se esperaba éxito");
    const connection = response.data as { secretReferences: Record<string, string> };
    expect(connection.secretReferences["appPassword"]).toBeDefined();
    expect(JSON.stringify(response.data)).not.toContain("clave-en-claro");
  });

  it("connections.create rechaza un tipo de conexión desconocido con APP_INVALID_PAYLOAD", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "connections.create",
        { projectId: "proyecto-1", name: "X", type: "no-existe" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
    expect(response.success || response.error.code).toBe("APP_INVALID_PAYLOAD");
  });

  it("connections.list resuelve projectId -> projectPath vía @dwm/project", async () => {
    const { api, fakeProjectManager } = buildApi();
    await api.execute(
      makeRequest(
        "connections.create",
        { projectId: "proyecto-1", name: "API", type: "http" },
        { caller: admin }
      )
    );
    const response = await api.execute(
      makeRequest("connections.list", { projectId: "proyecto-1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeProjectManager.getProject).toHaveBeenCalledWith("proyecto-1");
    if (response.success) expect(response.data).toHaveLength(1);
  });

  it("connections.list con un proyecto inexistente falla con categoría not-found", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest("connections.list", { projectId: "no-existe" }, { caller: admin })
    );
    expect(response.success).toBe(false);
    expect(response.success || response.error.category).toBe("not-found");
  });

  it("connections.test / connections.enable / connections.disable / connections.archive / connections.delete recorren el ciclo completo", async () => {
    const { api } = buildApi();
    const created = await api.execute(
      makeRequest(
        "connections.create",
        {
          projectId: "proyecto-1",
          name: "API",
          type: "http",
          config: { baseUrl: "https://example.test" },
        },
        { caller: admin }
      )
    );
    if (!created.success) throw new Error("fallo al crear");
    const id = (created.data as { id: string }).id;

    const tested = await api.execute(
      makeRequest("connections.test", { projectId: "proyecto-1", id }, { caller: admin })
    );
    expect(tested.success).toBe(true);

    const disabled = await api.execute(
      makeRequest("connections.disable", { projectId: "proyecto-1", id }, { caller: admin })
    );
    expect(disabled.success).toBe(true);
    if (disabled.success) expect((disabled.data as { enabled: boolean }).enabled).toBe(false);

    const enabled = await api.execute(
      makeRequest("connections.enable", { projectId: "proyecto-1", id }, { caller: admin })
    );
    expect(enabled.success).toBe(true);

    const archived = await api.execute(
      makeRequest(
        "connections.archive",
        { projectId: "proyecto-1", id },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(archived.success).toBe(true);

    const deleted = await api.execute(
      makeRequest(
        "connections.delete",
        { projectId: "proyecto-1", id },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(deleted.success).toBe(true);

    const afterDelete = await api.execute(
      makeRequest("connections.get", { projectId: "proyecto-1", id }, { caller: admin })
    );
    expect(afterDelete.success).toBe(true);
    if (afterDelete.success) expect(afterDelete.data).toBeUndefined();
  });

  it("connections.assign-capability / connections.capabilities / connections.revoke-capability deniegan por defecto", async () => {
    const { api } = buildApi();
    const created = await api.execute(
      makeRequest(
        "connections.create",
        { projectId: "proyecto-1", name: "API", type: "http" },
        { caller: admin }
      )
    );
    if (!created.success) throw new Error("fallo al crear");
    const id = (created.data as { id: string }).id;

    const assigned = await api.execute(
      makeRequest(
        "connections.assign-capability",
        { projectId: "proyecto-1", id, granteeId: "agent-1", capability: "posts.write" },
        { caller: admin }
      )
    );
    expect(assigned.success).toBe(true);

    const grants = await api.execute(
      makeRequest("connections.grants", { projectId: "proyecto-1", id }, { caller: admin })
    );
    expect(grants.success).toBe(true);
    if (grants.success) {
      expect(grants.data).toEqual([
        expect.objectContaining({ granteeId: "agent-1", capability: "posts.write" }),
      ]);
    }

    const revoked = await api.execute(
      makeRequest(
        "connections.revoke-capability",
        { projectId: "proyecto-1", id, granteeId: "agent-1", capability: "posts.write" },
        { caller: admin }
      )
    );
    expect(revoked.success).toBe(true);
  });

  it("connection-profiles.create/activate/list gestionan el perfil activo del proyecto", async () => {
    const { api } = buildApi();
    const created = await api.execute(
      makeRequest(
        "connection-profiles.create",
        { projectId: "proyecto-1", name: "Producción" },
        { caller: admin }
      )
    );
    expect(created.success).toBe(true);
    if (!created.success) throw new Error("fallo al crear perfil");
    const id = (created.data as { id: string }).id;

    const activated = await api.execute(
      makeRequest(
        "connection-profiles.activate",
        { projectId: "proyecto-1", id },
        { caller: admin }
      )
    );
    expect(activated.success).toBe(true);
    if (activated.success) expect((activated.data as { status: string }).status).toBe("active");

    const list = await api.execute(
      makeRequest("connection-profiles.list", { projectId: "proyecto-1" }, { caller: admin })
    );
    expect(list.success).toBe(true);
    if (list.success) expect(list.data).toHaveLength(1);
  });

  it("mcp.register/mcp.test/mcp.tools/mcp.delete usan el proceso stdio real del fixture del paquete connections-manager", async () => {
    const { api } = buildApi();
    const fixturePath = path.join(
      process.cwd(),
      "..",
      "connections-manager",
      "tests",
      "fixtures",
      "mcp-echo-server.mjs"
    );
    const connCreated = await api.execute(
      makeRequest(
        "connections.create",
        {
          projectId: "proyecto-1",
          name: "MCP local",
          type: "mcp-stdio",
          config: { command: process.execPath, args: [fixturePath] },
        },
        { caller: admin }
      )
    );
    if (!connCreated.success) throw new Error("fallo al crear conexión mcp");
    const connectionId = (connCreated.data as { id: string }).id;

    const registered = await api.execute(
      makeRequest(
        "mcp.register",
        { projectId: "proyecto-1", connectionId, name: "Fixture MCP", transport: "stdio" },
        { caller: admin }
      )
    );
    expect(registered.success).toBe(true);
    if (!registered.success) throw new Error("fallo al registrar servidor mcp");
    const serverId = (registered.data as { id: string }).id;

    const discovered = await api.execute(
      makeRequest("mcp.discover", { projectId: "proyecto-1", id: serverId }, { caller: admin })
    );
    expect(discovered.success).toBe(true);

    const tools = await api.execute(
      makeRequest("mcp.tools", { projectId: "proyecto-1", id: serverId }, { caller: admin })
    );
    expect(tools.success).toBe(true);
    if (tools.success)
      expect(tools.data).toEqual([{ name: "echo", description: "Devuelve la entrada" }]);

    const deleted = await api.execute(
      makeRequest(
        "mcp.delete",
        { projectId: "proyecto-1", id: serverId },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(deleted.success).toBe(true);
  });

  it("cualquier operación de connections/mcp sin ConnectionsManager conectado falla con APP_DEPENDENCY_UNAVAILABLE", async () => {
    const { api } = buildApi({ withConnectionsManager: false });
    const response = await api.execute(
      makeRequest("connections.list", { projectId: "proyecto-1" }, { caller: admin })
    );
    expect(response.success).toBe(false);
    expect(response.success || response.error.code).toBe("APP_DEPENDENCY_UNAVAILABLE");
  });
});
