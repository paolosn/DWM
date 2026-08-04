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
import { AgentManager } from "../../src/AgentManager.js";
import type { VerificationManager } from "@dwm/verification";
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
    it("lista las agentes reales del Workspace, excluyendo archivadas por defecto", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {
        activa: "# Activa\n",
        legada: "# Legada\n",
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      const list = await manager.listAgents();
      expect(list.map((s) => s.id).sort()).toEqual(["activa", "legada"]);

      await manager.archiveAgent("activa");
      expect((await manager.listAgents()).map((s) => s.id)).toEqual(["legada"]);
      expect((await manager.listAgents({ includeArchived: true })).map((s) => s.id).sort()).toEqual(
        ["activa", "legada"]
      );
    });

    it("extrae el nombre de cada agente para su resumen", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { "con-titulo": "# Mi Título\nCuerpo.\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      const [summary] = await manager.listAgents();
      expect(summary?.name).toBe("Mi Título");
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
    it("lee una agente existente con su contenido y metadatos", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { soporte: "# Soporte\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      const agent = await manager.getAgent("soporte");
      expect(agent.id).toBe("soporte");
      expect(agent.content).toBe("# Soporte\n");
      expect(agent.metadata.archived).toBe(false);

      expect(await manager.getAgentMetadata("soporte")).toEqual(agent.metadata);
    });

    it("lanza AGENT_NOT_FOUND si la agente no existe", async () => {
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
    it("crea una agente nueva con metadatos iniciales", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      const agent = await manager.createAgent({ id: "nueva", content: "# Nueva\n" });
      expect(agent.metadata.archived).toBe(false);
      expect(agent.metadata.createdAt).toBe(agent.metadata.updatedAt);

      expect((await manager.getAgent("nueva")).content).toBe("# Nueva\n");
    });

    it("lanza AGENT_ALREADY_EXISTS si el id ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { existente: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(
        manager.createAgent({ id: "existente", content: "# Y\n" })
      ).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_ALREADY_EXISTS,
      });
    });

    it("lanza AGENT_VALIDATION_FAILED si el contenido ya usa el frontmatter reservado dwm:", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(
        manager.createAgent({ id: "mala", content: "---\ndwm:\n  archived: true\n---\nX\n" })
      ).rejects.toMatchObject({ code: AgentErrorCode.AGENT_VALIDATION_FAILED });
    });
  });

  describe("updateAgent() / saveAgent()", () => {
    it("actualiza el contenido preservando createdAt y avanzando updatedAt", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { regla1: "# Original\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      const original = await manager.getAgent("regla1");

      await new Promise((resolve) => setTimeout(resolve, 5));
      const actualizada = await manager.updateAgent("regla1", "# Editada\n");
      expect(actualizada.content).toBe("# Editada\n");
      expect(actualizada.metadata.createdAt).toBe(original.metadata.createdAt);
      expect(actualizada.metadata.updatedAt).not.toBe(original.metadata.createdAt);
    });

    it("lanza AGENT_NOT_FOUND al actualizar una agente inexistente", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.updateAgent("no-existe", "# X\n")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_NOT_FOUND,
      });
    });

    it("saveAgent() persiste un Agent completo ya materializado", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { regla1: "# Original\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      const agent = await manager.getAgent("regla1");

      const saved = await manager.saveAgent({ ...agent, content: "# Guardada\n" });
      expect(saved.content).toBe("# Guardada\n");
      expect((await manager.getAgent("regla1")).content).toBe("# Guardada\n");
    });

    it("saveAgent() rechaza una estructura inválida", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(
        manager.saveAgent({
          id: "..",
          content: "# X\n",
          metadata: { archived: false, createdAt: "x", updatedAt: "x" },
        })
      ).rejects.toMatchObject({ code: AgentErrorCode.AGENT_INVALID_STRUCTURE });
    });
  });

  describe("duplicateAgent()", () => {
    it("duplica una agente existente con un nuevo id y metadatos propios", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { original: "# Original\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      const duplicada = await manager.duplicateAgent("original", "copia");
      expect(duplicada.id).toBe("copia");
      expect(duplicada.content).toBe("# Original\n");
      expect(duplicada.metadata.archived).toBe(false);

      expect((await manager.getAgent("original")).content).toBe("# Original\n");
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
      await makeWorkspaceWithAgents(root, { a: "# A\n", b: "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.duplicateAgent("a", "b")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_ALREADY_EXISTS,
      });
    });
  });

  describe("deleteAgent()", () => {
    it("elimina una agente existente", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { regla1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      await manager.deleteAgent("regla1");
      await expect(manager.getAgent("regla1")).rejects.toMatchObject({
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
    it("archiva y restaura una agente sin mover ni renombrar su fichero", async () => {
      const root = tempDir();
      const rulesDir = await makeWorkspaceWithAgents(root, { regla1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      const archivada = await manager.archiveAgent("regla1");
      expect(archivada.metadata.archived).toBe(true);
      expect(typeof archivada.metadata.archivedAt).toBe("string");

      const { promises: fs } = await import("node:fs");
      expect(await fs.readdir(rulesDir)).toEqual(["regla1.md"]);

      const restaurada = await manager.restoreAgent("regla1");
      expect(restaurada.metadata.archived).toBe(false);
      expect(restaurada.metadata.archivedAt).toBeUndefined();
      expect(restaurada.content).toBe("# X\n");
    });

    it("preserva el frontmatter propio del autor al archivar", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { regla1: "---\ntitle: Mi Agente\n---\n# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      const archivada = await manager.archiveAgent("regla1");
      expect(archivada.content).toContain("title: Mi Agente");
    });

    it("lanza AGENT_ALREADY_ARCHIVED si ya está archivada", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { regla1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await manager.archiveAgent("regla1");
      await expect(manager.archiveAgent("regla1")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_ALREADY_ARCHIVED,
      });
    });

    it("lanza AGENT_NOT_ARCHIVED si no está archivada", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { regla1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      await expect(manager.restoreAgent("regla1")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_NOT_ARCHIVED,
      });
    });
  });

  describe("searchAgents() / filterAgents()", () => {
    it("busca por texto libre sobre el índice reconstruido", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, {
        "agente-soporte": "# Soporte\n",
        "agente-ventas": "# Ventas\n",
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });

      expect((await manager.searchAgents("soporte")).map((s) => s.id)).toEqual(["agente-soporte"]);
    });

    it("filtra por estado archivado", async () => {
      const root = tempDir();
      await makeWorkspaceWithAgents(root, { a: "# A\n", b: "# B\n" });
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
      await makeWorkspaceWithAgents(root, { regla1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new AgentManager({ psnAdapter });
      const agent = await manager.getAgent("regla1");
      expect(manager.validateAgentStructure(agent).valid).toBe(true);
    });
  });

  describe("integraciones", () => {
    it("listConnectedIntegrations() siempre incluye psn-adapter y refleja el resto de dependencias, incluidas agent-manager y skill-manager", async () => {
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

      await manager.createAgent({ id: "regla1", content: "# X\n" });
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
      const agent = await manager.createAgent({ id: "regla1", content: "# X\n" });
      expect(agent.id).toBe("regla1");
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
      await manager.createAgent({ id: "regla1", content: "# X\n" });
      await manager.updateAgent("regla1", "# Y\n");
      await manager.duplicateAgent("regla1", "copia");
      await manager.archiveAgent("regla1");
      await manager.restoreAgent("regla1");
      await manager.deleteAgent("regla1");

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
      await makeWorkspaceWithAgents(root, { a: "# A\n", b: "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const managerConReglas = new AgentManager({ psnAdapter });
      await managerConReglas.listAgents();
      const ok = await managerConReglas.toStatusProvider().getStatus();
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
