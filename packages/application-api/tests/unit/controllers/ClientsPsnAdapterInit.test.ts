import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { ClientManager } from "@dwm/client-manager";
import { PortableWorkspaceManager } from "@dwm/portable-workspace";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { ensureWorkspaceSkeleton } from "../../../src/ensureWorkspaceSkeleton.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write"] as const };

describe("Clientes se resuelve siempre tras activar un Workspace, sin 'escanea primero' (fix/kilo-clients-psnadapter-init)", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function build(dataDir: string) {
    const psnAdapter = new PSNAdapter();
    const clientManager = new ClientManager({ psnAdapter });
    const portableWorkspaceManager = new PortableWorkspaceManager({ startDir: dataDir });
    const api = new ApplicationAPI({ psnAdapter, clientManager, portableWorkspaceManager });
    return { api, psnAdapter, clientManager, portableWorkspaceManager };
  }

  it("1: primer arranque real (ensureWorkspaceSkeleton + scanWorkspace, como hace ManagerComposition) — Clientes carga sin error", async () => {
    const dataDir = tempDir("dwm-clients-init-");
    const workspaceRoot = tempDir("dwm-clients-init-ws-");
    const { psnAdapter, clientManager } = build(dataDir);

    await ensureWorkspaceSkeleton(workspaceRoot);
    await psnAdapter.scanWorkspace(workspaceRoot);

    await expect(clientManager.listClients({ root: workspaceRoot })).resolves.toEqual([]);
  });

  it("2-6: workspace.register (activar un Workspace SIN reiniciar DWM: onboarding/import/cambio de Workspace) garantiza y reescanea de verdad — Clientes nunca falla con 'escanea primero'", async () => {
    const dataDir = tempDir("dwm-clients-init-");
    const workspaceRoot = tempDir("dwm-clients-init-ws-");
    const { api, clientManager } = build(dataDir);
    await new PortableWorkspaceManager({ startDir: dataDir }).initializeWorkspace(workspaceRoot);

    // Carpeta CLIENTES inexistente antes de activar (Workspace recién importado).
    expect(existsSync(path.join(workspaceRoot, "CLIENTES"))).toBe(false);

    const response = await api.execute(
      makeRequest("workspace.register", { root: workspaceRoot }, { caller: admin })
    );
    expect(response.success).toBe(true);

    // La carpeta ahora existe físicamente (esqueleto real garantizado).
    expect(existsSync(path.join(workspaceRoot, "CLIENTES"))).toBe(true);

    // Y Clientes resuelve de verdad, sin el error "escanea primero".
    await expect(clientManager.listClients({ root: workspaceRoot })).resolves.toEqual([]);
  });

  it("carpeta CLIENTES ya existente (con un cliente real) se conserva y se reconoce tras activar", async () => {
    const dataDir = tempDir("dwm-clients-init-");
    const workspaceRoot = tempDir("dwm-clients-init-ws-");
    await new PortableWorkspaceManager({ startDir: dataDir }).initializeWorkspace(workspaceRoot);
    const { api, clientManager } = build(dataDir);

    // Cliente real ya existente físicamente, antes de activar.
    await ensureWorkspaceSkeleton(workspaceRoot);
    const psnAdapterForSeed = new PSNAdapter();
    await psnAdapterForSeed.scanWorkspace(workspaceRoot);
    const seedClientManager = new ClientManager({ psnAdapter: psnAdapterForSeed });
    await seedClientManager.createClient({
      id: "mci-finance",
      name: "MCI Finance",
      slug: "mci-finance",
      root: workspaceRoot,
    } as never);

    const response = await api.execute(
      makeRequest("workspace.register", { root: workspaceRoot }, { caller: admin })
    );
    expect(response.success).toBe(true);

    const clients = await clientManager.listClients({ root: workspaceRoot });
    expect(clients.map((c) => c.id)).toContain("mci-finance");
  });

  it("reinicio de DWM (locateOrRecoverActiveWorkspace + ensureWorkspaceSkeleton + scanWorkspace, instancias completamente nuevas): Clientes sigue resolviendo sin error", async () => {
    const dataDir = tempDir("dwm-clients-init-");
    const workspaceRoot = tempDir("dwm-clients-init-ws-");
    const configDir = path.join(dataDir, "config");
    const { ConfigManager } = await import("@dwm/config");
    const firstConfigManager = new ConfigManager({ configDir });
    const firstWorkspaceManager = new PortableWorkspaceManager({
      startDir: dataDir,
      configManager: firstConfigManager,
    });
    await firstWorkspaceManager.initializeWorkspace(workspaceRoot);
    await firstWorkspaceManager.registerActiveWorkspace(workspaceRoot);

    // "Reinicio": instancias completamente nuevas, mismo ConfigManager persistido en disco.
    const restartedConfigManager = new ConfigManager({ configDir });
    const restartedWorkspaceManager = new PortableWorkspaceManager({
      startDir: dataDir,
      configManager: restartedConfigManager,
    });
    const recoveredRoot = await restartedWorkspaceManager.locateOrRecoverActiveWorkspace(dataDir);
    expect(recoveredRoot).toBe(workspaceRoot);

    const restartedPsnAdapter = new PSNAdapter();
    await ensureWorkspaceSkeleton(recoveredRoot!);
    await restartedPsnAdapter.scanWorkspace(recoveredRoot!);
    const restartedClientManager = new ClientManager({ psnAdapter: restartedPsnAdapter });

    await expect(restartedClientManager.listClients({ root: recoveredRoot })).resolves.toEqual([]);
  });

  it("cambio de Workspace en caliente: activar un segundo Workspace también reconoce Clientes de inmediato, sin reiniciar DWM", async () => {
    const dataDir = tempDir("dwm-clients-init-");
    const workspaceA = tempDir("dwm-clients-init-ws-a-");
    const workspaceB = tempDir("dwm-clients-init-ws-b-");
    await new PortableWorkspaceManager({ startDir: dataDir }).initializeWorkspace(workspaceA);
    await new PortableWorkspaceManager({ startDir: dataDir }).initializeWorkspace(workspaceB);
    const { api, clientManager } = build(dataDir);

    await api.execute(makeRequest("workspace.register", { root: workspaceA }, { caller: admin }));
    await expect(clientManager.listClients({ root: workspaceA })).resolves.toEqual([]);

    // Cambio de Workspace, mismo proceso, sin reiniciar.
    const secondResponse = await api.execute(
      makeRequest("workspace.register", { root: workspaceB }, { caller: admin })
    );
    expect(secondResponse.success).toBe(true);
    await expect(clientManager.listClients({ root: workspaceB })).resolves.toEqual([]);
  });
});
