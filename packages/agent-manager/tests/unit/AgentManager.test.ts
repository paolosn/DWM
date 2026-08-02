import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { EventBus } from "@dwm/event-bus";
import { Logger, LogLevel } from "@dwm/logger";
import { WorkspacePaths } from "@dwm/portable-workspace";
import { ImportManager } from "@dwm/import-manager";
import { PSNAdapter } from "@dwm/psn-adapter";
import type { VerificationManager } from "@dwm/verification";
import { AgentManager } from "../../src/AgentManager.js";
import { AgentErrorCode } from "../../src/errors/AgentErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeScannedPSNAdapter, makeWorkspaceWithAgents } from "./support/fixtures.js";

describe("AgentManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-agent-manager-core-"));
  }

  it("el constructor exige psnAdapter", () => {
    expect(
      () => new AgentManager({} as unknown as ConstructorParameters<typeof AgentManager>[0])
    ).toThrowError(expect.objectContaining({ code: AgentErrorCode.AGENT_INVALID_REQUEST }));
  });

  describe("resolución del directorio de agentes", () => {
    it("lanza AGENT_DIRECTORY_UNRESOLVABLE si el Workspace no se ha escaneado", async () => {
      const manager = new AgentManager({ psnAdapter: new PSNAdapter() });
      await expect(manager.listAgents()).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_DIRECTORY_UNRESOLVABLE,
      });
    });

    it("lanza AGENT_DIRECTORY_UNRESOLVABLE si el Workspace no tiene el recurso agents", async () => {
      const root = tempDir();
      const { promises: fs } = await import("node:fs");
      await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.listAgents()).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_DIRECTORY_UNRESOLVABLE,
      });
    });
  });

  describe("listAgents()", () => {
    it("lista los agentes reales del Workspace, excluyendo archivados por defecto", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {
        activo: { name: "Activo" },
        legado: {},
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      const list = await manager.listAgents();
      expect(list.map((s) => s.id).sort()).toEqual(["activo", "legado"]);

      await manager.archiveAgent("activo");
      const listaSinArchivados = await manager.listAgents();
      expect(listaSinArchivados.map((s) => s.id)).toEqual(["legado"]);

      const listaConArchivados = await manager.listAgents({ includeArchived: true });
      expect(listaConArchivados.map((s) => s.id).sort()).toEqual(["activo", "legado"]);
    });

    it("devuelve [] si el directorio de agentes está vacío", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      expect(await manager.listAgents()).toEqual([]);
    });
  });

  describe("getAgent() / getAgentMetadata()", () => {
    it("lee un agente existente con sus datos y metadatos", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { soporte: { name: "Soporte" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      const agent = await manager.getAgent("soporte");
      expect(agent.id).toBe("soporte");
      expect(agent.data).toEqual({ name: "Soporte" });
      expect(agent.metadata.archived).toBe(false);

      const metadata = await manager.getAgentMetadata("soporte");
      expect(metadata).toEqual(agent.metadata);
    });

    it("lanza AGENT_NOT_FOUND si el agente no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.getAgent("no-existe")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_NOT_FOUND,
      });
    });

    it("lanza AGENT_INVALID_ID para un id sintácticamente inseguro", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.getAgent("../fuera")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_INVALID_ID,
      });
    });
  });

  describe("createAgent()", () => {
    it("crea un agente nuevo con metadatos iniciales", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      const agent = await manager.createAgent({ id: "nuevo", data: { name: "Nuevo" } });
      expect(agent.metadata.archived).toBe(false);
      expect(agent.metadata.createdAt).toBe(agent.metadata.updatedAt);

      const releido = await manager.getAgent("nuevo");
      expect(releido.data).toEqual({ name: "Nuevo" });
    });

    it("lanza AGENT_ALREADY_EXISTS si el id ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { existente: {} });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.createAgent({ id: "existente", data: {} })).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_ALREADY_EXISTS,
      });
    });

    it("lanza AGENT_VALIDATION_FAILED si los datos incluyen la clave reservada", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.createAgent({ id: "malo", data: { __dwm: {} } })).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_VALIDATION_FAILED,
      });
    });
  });

  describe("updateAgent() / saveAgent()", () => {
    it("actualiza los datos preservando createdAt y avanzando updatedAt", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { agente: { name: "Original" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      const original = await manager.getAgent("agente");

      await new Promise((resolve) => setTimeout(resolve, 5));
      const actualizado = await manager.updateAgent("agente", { name: "Editado" });
      expect(actualizado.data).toEqual({ name: "Editado" });
      expect(actualizado.metadata.createdAt).toBe(original.metadata.createdAt);
      expect(actualizado.metadata.updatedAt).not.toBe(original.metadata.createdAt);
    });

    it("lanza AGENT_NOT_FOUND al actualizar un agente inexistente", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.updateAgent("no-existe", {})).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_NOT_FOUND,
      });
    });

    it("saveAgent() persiste un Agent completo ya materializado", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { agente: { name: "Original" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      const agent = await manager.getAgent("agente");

      const saved = await manager.saveAgent({ ...agent, data: { name: "Guardado" } });
      expect(saved.data).toEqual({ name: "Guardado" });
      const releido = await manager.getAgent("agente");
      expect(releido.data).toEqual({ name: "Guardado" });
    });

    it("saveAgent() rechaza una estructura inválida", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(
        manager.saveAgent({
          id: "..",
          data: {},
          metadata: { archived: false, createdAt: "x", updatedAt: "x" },
        })
      ).rejects.toMatchObject({ code: AgentErrorCode.AGENT_INVALID_STRUCTURE });
    });
  });

  describe("duplicateAgent()", () => {
    it("duplica un agente existente con un nuevo id y metadatos propios", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { original: { name: "Original" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      const duplicado = await manager.duplicateAgent("original", "copia");
      expect(duplicado.id).toBe("copia");
      expect(duplicado.data).toEqual({ name: "Original" });
      expect(duplicado.metadata.archived).toBe(false);

      const original = await manager.getAgent("original");
      expect(original.data).toEqual({ name: "Original" });
    });

    it("lanza AGENT_NOT_FOUND si el origen no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.duplicateAgent("no-existe", "copia")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_NOT_FOUND,
      });
    });

    it("lanza AGENT_ALREADY_EXISTS si el destino ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { a: {}, b: {} });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.duplicateAgent("a", "b")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_ALREADY_EXISTS,
      });
    });
  });

  describe("deleteAgent()", () => {
    it("elimina un agente existente y lo retira del índice", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { agente: {} });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      await manager.deleteAgent("agente");
      await expect(manager.getAgent("agente")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_NOT_FOUND,
      });
    });

    it("lanza AGENT_NOT_FOUND si no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.deleteAgent("no-existe")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_NOT_FOUND,
      });
    });
  });

  describe("archiveAgent() / restoreAgent()", () => {
    it("archiva y restaura un agente sin mover ni renombrar su fichero", async () => {
      const root = tempDir();
      const agentsDir = await makeWorkspaceWithAgents(root, { agente: { name: "x" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      const archivado = await manager.archiveAgent("agente");
      expect(archivado.metadata.archived).toBe(true);
      expect(typeof archivado.metadata.archivedAt).toBe("string");

      const { promises: fs } = await import("node:fs");
      expect(await fs.readdir(agentsDir)).toEqual(["agente.json"]);

      const restaurado = await manager.restoreAgent("agente");
      expect(restaurado.metadata.archived).toBe(false);
      expect(restaurado.metadata.archivedAt).toBeUndefined();
      expect(restaurado.data).toEqual({ name: "x" });
    });

    it("lanza AGENT_ALREADY_ARCHIVED si ya está archivado", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { agente: {} });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await manager.archiveAgent("agente");
      await expect(manager.archiveAgent("agente")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_ALREADY_ARCHIVED,
      });
    });

    it("lanza AGENT_NOT_ARCHIVED si no está archivado", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { agente: {} });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.restoreAgent("agente")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_NOT_ARCHIVED,
      });
    });
  });

  describe("searchAgents() / filterAgents()", () => {
    it("busca por texto libre sobre el índice reconstruido", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {
        "agente-soporte": { name: "Soporte" },
        "agente-ventas": { name: "Ventas" },
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      expect((await manager.searchAgents("soporte")).map((s) => s.id)).toEqual(["agente-soporte"]);
    });

    it("filtra por estado archivado", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { a: {}, b: {} });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await manager.archiveAgent("a");

      expect((await manager.filterAgents({ archived: true })).map((s) => s.id)).toEqual(["a"]);
      expect((await manager.filterAgents({ archived: false })).map((s) => s.id)).toEqual(["b"]);
    });
  });

  describe("validateAgentStructure()", () => {
    it("delega en AgentValidator", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { agente: { name: "x" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      const agent = await manager.getAgent("agente");
      expect(manager.validateAgentStructure(agent).valid).toBe(true);
    });
  });

  describe("integraciones", () => {
    it("listConnectedIntegrations() siempre incluye psn-adapter y refleja el resto de dependencias", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const workspacePaths = new WorkspacePaths(tempDir());
      const importManager = new ImportManager({ historyDir: tempDir() });
      const manager = new AgentManager({
        psnAdapter: new PSNAdapter(),
        configManager,
        workspacePaths,
        importManager,
      });
      expect(manager.listConnectedIntegrations()).toEqual(
        expect.arrayContaining(["psn-adapter", "config", "portable-workspace", "import-manager"])
      );
    });

    it("persiste su sección de configuración tras cada mutación", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new AgentManager({ psnAdapter, configManager });

      await manager.createAgent({ id: "agente", data: {} });
      const section = await configManager.getSection<{ agents: number }>("agent-manager");
      expect(section?.agents).toBe(1);
    });

    it("registra un warning vía logger si la verificación posterior a una mutación falla, sin fallar la operación", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const logs: string[] = [];
      const logger = new Logger("agent-manager-test", {
        minLevel: LogLevel.INFO,
        transports: [
          {
            write: async (entry) => {
              logs.push(entry.message);
            },
          },
        ],
      });
      const fakeVerificationManager = {
        verify: async () => {
          throw new Error("verificación no disponible");
        },
      } as unknown as VerificationManager;

      const manager = new AgentManager({
        psnAdapter,
        logger,
        verificationManager: fakeVerificationManager,
      });
      const agent = await manager.createAgent({ id: "agente", data: {} });
      expect(agent.id).toBe("agente");
      expect(logs.some((m) => m.includes("verificación"))).toBe(true);
    });

    it("publica eventos a través de un EventBus real para cada operación de escritura", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const eventBus = new EventBus();
      const received: string[] = [];
      for (const phase of ["created", "updated", "deleted", "duplicated", "archived", "restored"]) {
        eventBus.subscribe(`agent.${phase}`, () => {
          received.push(phase);
        });
      }

      const manager = new AgentManager({ psnAdapter, eventBus });
      await manager.createAgent({ id: "agente", data: {} });
      await manager.updateAgent("agente", { name: "x" });
      await manager.duplicateAgent("agente", "copia");
      await manager.archiveAgent("agente");
      await manager.restoreAgent("agente");
      await manager.deleteAgent("agente");

      expect(received).toEqual([
        "created",
        "updated",
        "duplicated",
        "archived",
        "restored",
        "deleted",
      ]);
    });
  });

  describe("toStatusProvider()", () => {
    it("informa UNKNOWN si el Workspace no se ha escaneado, y OK con el recuento de agentes en caso contrario", async () => {
      const manager = new AgentManager({ psnAdapter: new PSNAdapter() });
      const unknown = await manager.toStatusProvider().getStatus();
      expect(unknown.level).toBe("UNKNOWN");

      const root = tempDir();
      await makeWorkspaceWithAgents(root, { a: {}, b: {} });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const managerConAgentes = new AgentManager({ psnAdapter });
      await managerConAgentes.listAgents();
      const ok = await managerConAgentes.toStatusProvider().getStatus();
      expect(ok.level).toBe("OK");
      expect(ok.detail?.["agents"]).toBe(2);
    });
  });

  describe("IModule", () => {
    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new AgentManager({ psnAdapter: new PSNAdapter(), configManager });

      await core.registerModule(manager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "agent-manager", status: "OK" }),
      ]);
      const section = await configManager.getSection<{ integrations: string[] }>("agent-manager");
      expect(section?.integrations).toContain("psn-adapter");

      await manager.dispose();
      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });
  });
});
