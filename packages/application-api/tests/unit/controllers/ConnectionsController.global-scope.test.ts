import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { SecretsManager } from "@dwm/secrets";
import { ConnectionsManager } from "@dwm/connections-manager";
import type { PortableWorkspaceManager, WorkspaceRegistryEntry } from "@dwm/portable-workspace";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = {
  grantedCapabilities: ["read", "write", "delete", "execute", "configure"] as const,
};

describe("ConnectionsController — conexiones/MCP GLOBALES (client-workflow-v2, objetivo 3)", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function buildApi() {
    const workspaceRoot = tempDir("dwm-global-connections-ws-");
    const secretsDir = tempDir("dwm-global-connections-secrets-");
    const secretsManager = new SecretsManager({
      configuration: { secretsDir, masterKey: "clave-maestra-tests" },
    });
    const connectionsManager = new ConnectionsManager({ secretsManager });

    const portableWorkspaceManager = {
      getActiveWorkspace: (): WorkspaceRegistryEntry | undefined => ({
        root: workspaceRoot,
        metadata: { id: "ws-1", name: "ws", createdAt: "", updatedAt: "" } as never,
        registeredAt: new Date().toISOString(),
      }),
    } as unknown as PortableWorkspaceManager;

    const api = new ApplicationAPI({ connectionsManager, portableWorkspaceManager });
    return { api, workspaceRoot };
  }

  it("connections.create-global persiste bajo .connections/global (mismo ConnectionsManager, distinta carpeta), nunca devuelve el secreto", async () => {
    const { api, workspaceRoot } = buildApi();
    const response = await api.execute(
      makeRequest(
        "connections.create-global",
        {
          name: "GitHub global",
          type: "mcp-remote",
          config: { url: "https://mcp.github.example.test" },
          secrets: { token: "clave-en-claro-global" },
        },
        { caller: admin }
      )
    );

    expect(response.success).toBe(true);
    if (!response.success) throw new Error("se esperaba éxito");
    const connection = response.data as { id: string; secretReferences: Record<string, string> };
    expect(connection.secretReferences["token"]).toBeDefined();
    expect(JSON.stringify(response.data)).not.toContain("clave-en-claro-global");
    expect(existsSync(path.join(workspaceRoot, ".connections", "global"))).toBe(true);
  });

  it("connections.list-global lista las conexiones globales reales, independiente de cualquier cliente", async () => {
    const { api } = buildApi();
    await api.execute(
      makeRequest(
        "connections.create-global",
        { name: "Supabase global", type: "mcp-remote", config: { endpoint: "https://x.test" } },
        { caller: admin }
      )
    );

    const response = await api.execute(
      makeRequest("connections.list-global", {}, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data).toHaveLength(1);
    expect(response.data[0]?.name).toBe("Supabase global");
  });

  it("connections.test-global y connections.update-global operan sobre la misma conexión global real", async () => {
    const { api } = buildApi();
    const created = await api.execute(
      makeRequest(
        "connections.create-global",
        { name: "Original", type: "mcp-remote", config: { endpoint: "https://x.test" } },
        { caller: admin }
      )
    );
    expect(created.success).toBe(true);
    if (!created.success) return;
    const id = created.data.id;

    const tested = await api.execute(
      makeRequest("connections.test-global", { id }, { caller: admin })
    );
    expect(tested.success).toBe(true);

    const updated = await api.execute(
      makeRequest("connections.update-global", { id, name: "Renombrada" }, { caller: admin })
    );
    expect(updated.success).toBe(true);
    if (!updated.success) return;
    expect(updated.data.name).toBe("Renombrada");
  });

  it("connections.delete-global elimina realmente la conexión global", async () => {
    const { api } = buildApi();
    const created = await api.execute(
      makeRequest(
        "connections.create-global",
        { name: "A borrar", type: "mcp-remote", config: { endpoint: "https://x.test" } },
        { caller: admin }
      )
    );
    expect(created.success).toBe(true);
    if (!created.success) return;

    const deleted = await api.execute(
      makeRequest(
        "connections.delete-global",
        { id: created.data.id },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(deleted.success).toBe(true);

    const list = await api.execute(makeRequest("connections.list-global", {}, { caller: admin }));
    expect(list.success).toBe(true);
    if (!list.success) return;
    expect(list.data).toHaveLength(0);
  });

  it("las conexiones globales y las de cliente conviven en carpetas reales distintas (nunca se mezclan)", async () => {
    const { api, workspaceRoot } = buildApi();
    await api.execute(
      makeRequest(
        "connections.create-global",
        { name: "Global", type: "mcp-remote", config: { endpoint: "https://x.test" } },
        { caller: admin }
      )
    );
    await api.execute(
      makeRequest(
        "connections.create-for-client",
        {
          clientId: "mci-finance",
          name: "De cliente",
          type: "mcp-remote",
          config: { endpoint: "https://y.test" },
        },
        { caller: admin }
      )
    );

    const globalList = await api.execute(
      makeRequest("connections.list-global", {}, { caller: admin })
    );
    const clientList = await api.execute(
      makeRequest("connections.list-for-client", { clientId: "mci-finance" }, { caller: admin })
    );
    expect(globalList.success && globalList.data).toHaveLength(1);
    expect(clientList.success && clientList.data).toHaveLength(1);
    expect(existsSync(path.join(workspaceRoot, ".connections", "global"))).toBe(true);
    expect(existsSync(path.join(workspaceRoot, "CLIENTES", ".connections", "mci-finance"))).toBe(
      true
    );
  });
});
