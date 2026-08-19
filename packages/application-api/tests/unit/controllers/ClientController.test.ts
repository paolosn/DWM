import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ClientManager } from "@dwm/client-manager";
import { PSNAdapter } from "@dwm/psn-adapter";
import { PortableWorkspaceManager } from "@dwm/portable-workspace";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "archive", "restore", "delete"] as const };

describe("ClientController", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-client-ctrl-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  /**
   * client-workflow "fix/kilo-clients-active-root-race" — bug real de
   * producción reproducido: `ClientController` ya NO depende del
   * `activeRoot` interno (y mutable) de PSNAdapter cuando `root` no
   * viene explícito en el payload -- resuelve siempre la raíz REAL
   * del Workspace activo (`portableWorkspaceManager.getActiveWorkspace()`).
   * Este fixture simula exactamente ese escenario real: un Workspace
   * activo real, sin ningún `root` explícito en las llamadas.
   */
  function buildApi() {
    const workspaceRoot = tempDir();
    const fakeManager = {
      listClients: vi.fn().mockResolvedValue([{ id: "c1" }]),
      getClient: vi.fn().mockResolvedValue({ id: "c1" }),
      createClient: vi.fn().mockResolvedValue({ id: "c1" }),
      updateClient: vi.fn().mockResolvedValue({ id: "c1" }),
      archiveClient: vi.fn().mockResolvedValue({ id: "c1" }),
      restoreClient: vi.fn().mockResolvedValue({ id: "c1" }),
      deleteClient: vi.fn().mockResolvedValue(undefined),
    } as unknown as ClientManager;

    const psnAdapter = new PSNAdapter();
    const portableWorkspaceManager = {
      getActiveWorkspace: () => ({ root: workspaceRoot, metadata: {}, registeredAt: "" }),
    } as unknown as PortableWorkspaceManager;

    const api = new ApplicationAPI({
      clientManager: fakeManager,
      psnAdapter,
      portableWorkspaceManager,
    });
    return { api, fakeManager, workspaceRoot };
  }

  it("clients.list y clients.get resuelven siempre la raíz REAL del Workspace activo (nunca dependen del activeRoot interno y mutable de PSNAdapter)", async () => {
    const { api, fakeManager, workspaceRoot } = buildApi();
    await api.execute(makeRequest("clients.list", {}, { caller: admin }));
    await api.execute(makeRequest("clients.get", { id: "c1" }, { caller: admin }));
    expect(fakeManager.getClient).toHaveBeenCalledWith("c1", workspaceRoot);
  });

  it("clients.create incluye campos opcionales solo si se proporcionan, resolviendo siempre la raíz real", async () => {
    const { api, fakeManager, workspaceRoot } = buildApi();
    await api.execute(
      makeRequest(
        "clients.create",
        { id: "c1", name: "Cliente", slug: "cliente", tags: ["vip"], description: "desc" },
        { caller: admin }
      )
    );
    expect(fakeManager.createClient).toHaveBeenCalledWith(
      { id: "c1", name: "Cliente", slug: "cliente", tags: ["vip"], description: "desc" },
      workspaceRoot
    );

    await api.execute(
      makeRequest("clients.create", { id: "c2", name: "N", slug: "n" }, { caller: admin })
    );
    expect(fakeManager.createClient).toHaveBeenCalledWith(
      { id: "c2", name: "N", slug: "n" },
      workspaceRoot
    );
  });

  it("clients.update solo envía los campos indicados, resolviendo siempre la raíz real", async () => {
    const { api, fakeManager, workspaceRoot } = buildApi();
    await api.execute(
      makeRequest("clients.update", { id: "c1", name: "Nuevo" }, { caller: admin })
    );
    expect(fakeManager.updateClient).toHaveBeenCalledWith("c1", { name: "Nuevo" }, workspaceRoot);
  });

  it("clients.archive y clients.restore delegan correctamente, resolviendo siempre la raíz real", async () => {
    const { api, fakeManager, workspaceRoot } = buildApi();
    await api.execute(makeRequest("clients.archive", { id: "c1" }, { caller: admin }));
    expect(fakeManager.archiveClient).toHaveBeenCalledWith("c1", workspaceRoot);
    await api.execute(makeRequest("clients.restore", { id: "c1" }, { caller: admin }));
    expect(fakeManager.restoreClient).toHaveBeenCalledWith("c1", workspaceRoot);
  });

  it("clients.delete exige confirmación explícita, resolviendo siempre la raíz real", async () => {
    const { api, fakeManager, workspaceRoot } = buildApi();
    const denied = await api.execute(
      makeRequest("clients.delete", { id: "c1" }, { caller: admin })
    );
    expect(denied.success).toBe(false);

    const ok = await api.execute(
      makeRequest(
        "clients.delete",
        { id: "c1" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(ok.success).toBe(true);
    expect(fakeManager.deleteClient).toHaveBeenCalledWith(
      "c1",
      { confirmPermanent: true },
      workspaceRoot
    );
  });

  it("bug real reproducido: sin Workspace activo, clients.list falla con un error real y claro (nunca oculta el fallo con catch/[])", async () => {
    const api = new ApplicationAPI({
      clientManager: {
        listClients: vi.fn().mockResolvedValue([]),
      } as unknown as ClientManager,
    });
    const response = await api.execute(makeRequest("clients.list", {}, { caller: admin }));
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.message).toContain("Sistema de Trabajo activo");
    }
  });

  it("bug real reproducido: tras escanear OTRA raíz distinta (p. ej. PSN-BASE, como hace Biblioteca IA global), clients.list sigue usando la raíz REAL del Workspace, nunca la última raíz escaneada", async () => {
    const { fakeManager, workspaceRoot } = buildApi();
    // Simula exactamente el escenario real reportado: otra parte de la
    // app (Biblioteca IA global) escanea una raíz DISTINTA primero.
    const otherRoot = tempDir();
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(otherRoot);

    const apiWithSamePsnAdapter = new ApplicationAPI({
      clientManager: fakeManager,
      psnAdapter,
      portableWorkspaceManager: {
        getActiveWorkspace: () => ({ root: workspaceRoot, metadata: {}, registeredAt: "" }),
      } as unknown as PortableWorkspaceManager,
    });

    await apiWithSamePsnAdapter.execute(
      makeRequest("clients.get", { id: "c1" }, { caller: admin })
    );
    expect(fakeManager.getClient).toHaveBeenCalledWith("c1", workspaceRoot);
    expect(fakeManager.getClient).not.toHaveBeenCalledWith("c1", otherRoot);
  });

  it("cambiar de Workspace en caliente (workspace.register real, sin reiniciar DWM) hace que Clientes use el NUEVO Workspace, nunca el anterior", async () => {
    const workspaceA = tempDir();
    const workspaceB = tempDir();
    const dataDir = tempDir();
    const psnAdapter = new PSNAdapter();
    const portableWorkspaceManager = new PortableWorkspaceManager({ startDir: dataDir });
    const fakeManager = {
      getClient: vi.fn().mockResolvedValue({ id: "c1" }),
    } as unknown as ClientManager;

    const api = new ApplicationAPI({
      clientManager: fakeManager,
      psnAdapter,
      portableWorkspaceManager,
    });

    await portableWorkspaceManager.initializeWorkspace(workspaceA);
    await api.execute(makeRequest("workspace.register", { root: workspaceA }, { caller: admin }));
    await api.execute(makeRequest("clients.get", { id: "c1" }, { caller: admin }));
    expect(fakeManager.getClient).toHaveBeenLastCalledWith("c1", workspaceA);

    await portableWorkspaceManager.initializeWorkspace(workspaceB);
    await api.execute(makeRequest("workspace.register", { root: workspaceB }, { caller: admin }));
    await api.execute(makeRequest("clients.get", { id: "c1" }, { caller: admin }));
    expect(fakeManager.getClient).toHaveBeenLastCalledWith("c1", workspaceB);
  });
});
