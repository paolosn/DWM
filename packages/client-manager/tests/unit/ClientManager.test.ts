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
import { AgentManager } from "@dwm/agent-manager";
import { SkillManager } from "@dwm/skill-manager";
import { RuleManager } from "@dwm/rule-manager";
import { KnowledgeManager } from "@dwm/knowledge-manager";
import type { VerificationManager } from "@dwm/verification";
import { ClientManager } from "../../src/ClientManager.js";
import { ClientErrorCode } from "../../src/errors/ClientErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeScannedPSNAdapter, makeWorkspaceWithClients } from "./support/fixtures.js";

describe("ClientManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-client-manager-core-"));
  }

  it("el constructor exige psnAdapter", () => {
    expect(
      () => new ClientManager({} as unknown as ConstructorParameters<typeof ClientManager>[0])
    ).toThrowError(expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_REQUEST }));
  });

  describe("resolución del directorio de clientes", () => {
    it("lanza CLIENT_DIRECTORY_UNRESOLVABLE si el Workspace no se ha escaneado", async () => {
      const manager = new ClientManager({ psnAdapter: new PSNAdapter() });
      await expect(manager.listClients()).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_DIRECTORY_UNRESOLVABLE,
      });
    });

    it("lanza CLIENT_DIRECTORY_UNRESOLVABLE si el Workspace no tiene el recurso clientes", async () => {
      const root = tempDir();
      const { promises: fs } = await import("node:fs");
      await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(manager.listClients()).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_DIRECTORY_UNRESOLVABLE,
      });
    });
  });

  describe("listClients()", () => {
    it("lista los clientes reales del Workspace, excluyendo archivados por defecto", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { activo: {}, legado: {} });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });

      expect((await manager.listClients()).map((s) => s.id).sort()).toEqual(["activo", "legado"]);

      await manager.archiveClient("activo");
      expect((await manager.listClients()).map((s) => s.id)).toEqual(["legado"]);
      expect(
        (await manager.listClients({ includeArchived: true })).map((s) => s.id).sort()
      ).toEqual(["activo", "legado"]);
    });

    it("devuelve [] si el recurso de clientes está vacío", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      expect(await manager.listClients()).toEqual([]);
    });
  });

  describe("getClient() / getClientMetadata()", () => {
    it("lee un cliente existente con sus datos y metadatos", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {
        "mci-finance": { name: "MCI Finance", slug: "mci-finance", tags: ["banca"] },
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });

      const client = await manager.getClient("mci-finance");
      expect(client.name).toBe("MCI Finance");
      expect(client.tags).toEqual(["banca"]);
      expect(client.dwm.archived).toBe(false);
      expect(await manager.getClientMetadata("mci-finance")).toEqual(client.dwm);
    });

    it("lanza CLIENT_NOT_FOUND si el cliente no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(manager.getClient("no-existe")).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_NOT_FOUND,
      });
    });

    it("lanza CLIENT_INVALID_ID para un id sintácticamente inseguro", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(manager.getClient("../fuera")).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_INVALID_ID,
      });
    });
  });

  describe("createClient()", () => {
    it("crea un cliente nuevo con estado por defecto 'active' y etiquetas normalizadas", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });

      const client = await manager.createClient({
        id: "mci-finance",
        name: "MCI Finance",
        slug: "mci-finance",
        tags: ["Banca", "banca"],
      });
      expect(client.status).toBe("active");
      expect(client.tags).toEqual(["banca"]);
      expect(client.dwm.archived).toBe(false);
      expect(client.dwm.createdAt).toBe(client.dwm.updatedAt);
      expect(client.references).toEqual({
        projects: [],
        knowledge: [],
        agents: [],
        skills: [],
        rules: [],
      });

      expect((await manager.getClient("mci-finance")).name).toBe("MCI Finance");
    });

    it("acepta status y referencias iniciales explícitas", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });

      const client = await manager.createClient({
        id: "prospecto",
        name: "Prospecto",
        slug: "prospecto",
        status: "prospect",
        references: { projects: ["proyecto-1"] },
      });
      expect(client.status).toBe("prospect");
      expect(client.references.projects).toEqual(["proyecto-1"]);
    });

    it("lanza CLIENT_ALREADY_EXISTS si el id ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { existente: { slug: "existente" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(
        manager.createClient({ id: "existente", name: "X", slug: "otro-slug" })
      ).rejects.toMatchObject({ code: ClientErrorCode.CLIENT_ALREADY_EXISTS });
    });

    it("lanza CLIENT_SLUG_ALREADY_EXISTS si el slug ya existe en otro cliente", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { uno: { slug: "duplicado" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(
        manager.createClient({ id: "dos", name: "Dos", slug: "duplicado" })
      ).rejects.toMatchObject({ code: ClientErrorCode.CLIENT_SLUG_ALREADY_EXISTS });
    });

    it("lanza CLIENT_INVALID_SLUG / CLIENT_INVALID_NAME para datos inválidos", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(
        manager.createClient({ id: "a", name: "A", slug: "Slug Invalido" })
      ).rejects.toMatchObject({ code: ClientErrorCode.CLIENT_INVALID_SLUG });
      await expect(manager.createClient({ id: "a", name: "", slug: "a" })).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_INVALID_NAME,
      });
    });
  });

  describe("updateClient() / saveClient()", () => {
    it("aplica cambios parciales preservando lo no indicado y avanzando updatedAt", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {
        "mci-finance": { name: "MCI", slug: "mci-finance", tags: ["banca"] },
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      const original = await manager.getClient("mci-finance");

      await new Promise((resolve) => setTimeout(resolve, 5));
      const updated = await manager.updateClient("mci-finance", { name: "MCI Finance S.L." });
      expect(updated.name).toBe("MCI Finance S.L.");
      expect(updated.tags).toEqual(["banca"]);
      expect(updated.dwm.createdAt).toBe(original.dwm.createdAt);
      expect(updated.dwm.updatedAt).not.toBe(original.dwm.updatedAt);
    });

    it("permite limpiar la descripción con null", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {
        cliente: { slug: "cliente", description: "Antigua descripción" },
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      const updated = await manager.updateClient("cliente", { description: null });
      expect(updated.description).toBeUndefined();
    });

    it("lanza CLIENT_SLUG_ALREADY_EXISTS si el nuevo slug colisiona con otro cliente", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {
        a: { slug: "slug-a" },
        b: { slug: "slug-b" },
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(manager.updateClient("a", { slug: "slug-b" })).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_SLUG_ALREADY_EXISTS,
      });
    });

    it("permite conservar el propio slug al actualizar otros campos", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { a: { slug: "slug-a" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      const updated = await manager.updateClient("a", { slug: "slug-a", status: "paused" });
      expect(updated.slug).toBe("slug-a");
      expect(updated.status).toBe("paused");
    });

    it("lanza CLIENT_NOT_FOUND al actualizar un cliente inexistente", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(manager.updateClient("no-existe", { name: "X" })).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_NOT_FOUND,
      });
    });

    it("saveClient() persiste un Client completo ya materializado", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { a: { slug: "slug-a" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      const client = await manager.getClient("a");
      const saved = await manager.saveClient({ ...client, name: "Guardado" });
      expect(saved.name).toBe("Guardado");
      expect((await manager.getClient("a")).name).toBe("Guardado");
    });

    it("saveClient() rechaza una estructura inválida", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(
        manager.saveClient({
          id: "..",
          name: "X",
          slug: "x",
          status: "active",
          tags: [],
          references: { projects: [], knowledge: [], agents: [], skills: [], rules: [] },
          dwm: { archived: false, createdAt: "x", updatedAt: "x" },
        })
      ).rejects.toMatchObject({ code: ClientErrorCode.CLIENT_INVALID_STRUCTURE });
    });
  });

  describe("duplicateClient()", () => {
    it("duplica un cliente existente con nuevo id y slug, reiniciando referencias y metadatos", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {
        origen: {
          slug: "origen",
          tags: ["vip"],
          references: {
            projects: ["p1"],
            knowledge: [],
            agents: [],
            skills: [],
            rules: [],
          },
        },
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });

      const duplicate = await manager.duplicateClient("origen", "copia", "copia");
      expect(duplicate.id).toBe("copia");
      expect(duplicate.slug).toBe("copia");
      expect(duplicate.tags).toEqual(["vip"]);
      expect(duplicate.references.projects).toEqual([]);
      expect(duplicate.dwm.archived).toBe(false);

      expect((await manager.getClient("origen")).tags).toEqual(["vip"]);
    });

    it("lanza CLIENT_NOT_FOUND si el origen no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(manager.duplicateClient("no-existe", "copia", "copia")).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_NOT_FOUND,
      });
    });

    it("lanza CLIENT_ALREADY_EXISTS si el id destino ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { a: { slug: "a" }, b: { slug: "b" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(manager.duplicateClient("a", "b", "otro-slug")).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_ALREADY_EXISTS,
      });
    });

    it("lanza CLIENT_SLUG_ALREADY_EXISTS si el slug destino ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { a: { slug: "slug-a" }, b: { slug: "slug-b" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(manager.duplicateClient("a", "c", "slug-b")).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_SLUG_ALREADY_EXISTS,
      });
    });
  });

  describe("deleteClient()", () => {
    it("exige confirmPermanent: true y elimina el fichero exacto", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { cliente: { slug: "cliente" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });

      await expect(
        manager.deleteClient("cliente", { confirmPermanent: false })
      ).rejects.toMatchObject({ code: ClientErrorCode.CLIENT_DELETE_NOT_CONFIRMED });

      await manager.deleteClient("cliente", { confirmPermanent: true });
      await expect(manager.getClient("cliente")).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_NOT_FOUND,
      });
    });

    it("lanza CLIENT_NOT_FOUND si no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(
        manager.deleteClient("no-existe", { confirmPermanent: true })
      ).rejects.toMatchObject({ code: ClientErrorCode.CLIENT_NOT_FOUND });
    });
  });

  describe("archiveClient() / restoreClient()", () => {
    it("archiva y restaura un cliente sin mover ni renombrar su fichero", async () => {
      const root = tempDir();
      const clientsDir = await makeWorkspaceWithClients(root, { cliente: { slug: "cliente" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });

      const archived = await manager.archiveClient("cliente");
      expect(archived.dwm.archived).toBe(true);
      expect(typeof archived.dwm.archivedAt).toBe("string");

      const { promises: fs } = await import("node:fs");
      expect(await fs.readdir(clientsDir)).toEqual(["cliente.json"]);

      const restored = await manager.restoreClient("cliente");
      expect(restored.dwm.archived).toBe(false);
      expect(restored.dwm.archivedAt).toBeUndefined();
    });

    it("lanza CLIENT_ALREADY_ARCHIVED si ya está archivado", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { cliente: { slug: "cliente" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await manager.archiveClient("cliente");
      await expect(manager.archiveClient("cliente")).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_ALREADY_ARCHIVED,
      });
    });

    it("lanza CLIENT_NOT_ARCHIVED si no está archivado", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { cliente: { slug: "cliente" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(manager.restoreClient("cliente")).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_NOT_ARCHIVED,
      });
    });
  });

  describe("searchClients() / filterClients() / listTags()", () => {
    it("busca por texto libre", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {
        "mci-finance": { name: "MCI Finance", slug: "mci-finance" },
        "otro-cliente": { name: "Otro Cliente", slug: "otro-cliente" },
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      expect((await manager.searchClients("mci")).map((s) => s.id)).toEqual(["mci-finance"]);
    });

    it("filtra por archived, status y tags", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {
        a: { slug: "a", status: "active", tags: ["vip"] },
        b: { slug: "b", status: "prospect", tags: [] },
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await manager.archiveClient("b");

      expect((await manager.filterClients({ archived: true })).map((s) => s.id)).toEqual(["b"]);
      expect((await manager.filterClients({ status: "active" })).map((s) => s.id)).toEqual(["a"]);
      expect((await manager.filterClients({ tags: ["vip"] })).map((s) => s.id)).toEqual(["a"]);
    });

    it("listTags agrega etiquetas de todo el índice", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { a: { slug: "a", tags: ["vip", "banca"] } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      expect(await manager.listTags()).toEqual(["banca", "vip"]);
    });
  });

  describe("referencias", () => {
    it("addReference()/removeReference() gestionan referencias por categoría", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { cliente: { slug: "cliente" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });

      const withRef = await manager.addReference("cliente", "projects", "proyecto-1");
      expect(withRef.references.projects).toEqual(["proyecto-1"]);

      const withoutRef = await manager.removeReference("cliente", "projects", "proyecto-1");
      expect(withoutRef.references.projects).toEqual([]);
    });

    it("addReference() rechaza categorías o ids inválidos", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { cliente: { slug: "cliente" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      await expect(manager.addReference("cliente", "clients" as never, "x")).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_INVALID_REFERENCE_KIND,
      });
      await expect(manager.addReference("cliente", "projects", "")).rejects.toMatchObject({
        code: ClientErrorCode.CLIENT_INVALID_REFERENCE_ID,
      });
    });

    it("checkReferences() solo comprueba categorías con módulo integrado", async () => {
      const root = tempDir();
      const clientsRoot = tempDir();
      await makeWorkspaceWithClients(clientsRoot, {
        cliente: {
          slug: "cliente",
          references: {
            projects: [],
            knowledge: ["k-no-existe.md"],
            agents: [],
            skills: [],
            rules: [],
          },
        },
      });
      const psnAdapter = await makeScannedPSNAdapter(clientsRoot);

      const knowledgeRoot = root;
      const { promises: fs } = await import("node:fs");
      await fs.mkdir(path.join(knowledgeRoot, "PSN-KNOWLEDGE-GLOBAL"), { recursive: true });
      await fs.mkdir(path.join(knowledgeRoot, "PSN-BASE"), { recursive: true });
      const knowledgePsnAdapter = await makeScannedPSNAdapter(knowledgeRoot);
      const knowledgeManager = new KnowledgeManager({ psnAdapter: knowledgePsnAdapter });

      const manager = new ClientManager({ psnAdapter, knowledgeManager });
      const result = await manager.checkReferences("cliente");
      expect(result.checked).toEqual(["knowledge"]);
      expect(result.missing.knowledge).toEqual(["k-no-existe.md"]);
    });
  });

  describe("validateClientStructure()", () => {
    it("delega en ClientValidator", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, { cliente: { slug: "cliente" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new ClientManager({ psnAdapter });
      const client = await manager.getClient("cliente");
      expect(manager.validateClientStructure(client).valid).toBe(true);
    });
  });

  describe("toStatusProvider()", () => {
    it("informa UNKNOWN si el Workspace no se ha escaneado, y OK con el recuento en caso contrario", async () => {
      const manager = new ClientManager({ psnAdapter: new PSNAdapter() });
      const unknown = await manager.toStatusProvider().getStatus();
      expect(unknown.level).toBe("UNKNOWN");

      const root = tempDir();
      await makeWorkspaceWithClients(root, { a: { slug: "a" }, b: { slug: "b" } });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const managerConClientes = new ClientManager({ psnAdapter });
      await managerConClientes.listClients();
      const ok = await managerConClientes.toStatusProvider().getStatus();
      expect(ok.level).toBe("OK");
      expect(ok.detail?.["clients"]).toBe(2);
    });
  });

  describe("integraciones", () => {
    it("listConnectedIntegrations() siempre incluye psn-adapter y refleja el resto de dependencias", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const workspacePaths = new WorkspacePaths(tempDir());
      const importManager = new ImportManager({ historyDir: tempDir() });
      const agentManager = new AgentManager({ psnAdapter: new PSNAdapter() });
      const skillManager = new SkillManager({ psnAdapter: new PSNAdapter() });
      const ruleManager = new RuleManager({ psnAdapter: new PSNAdapter() });
      const knowledgeManager = new KnowledgeManager({ psnAdapter: new PSNAdapter() });
      const manager = new ClientManager({
        psnAdapter: new PSNAdapter(),
        configManager,
        workspacePaths,
        importManager,
        agentManager,
        skillManager,
        ruleManager,
        knowledgeManager,
      });
      expect(manager.listConnectedIntegrations()).toEqual(
        expect.arrayContaining([
          "psn-adapter",
          "config",
          "portable-workspace",
          "import-manager",
          "agent-manager",
          "skill-manager",
          "rule-manager",
          "knowledge-manager",
        ])
      );
    });

    it("persiste su sección de configuración tras cada mutación", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new ClientManager({ psnAdapter, configManager });

      await manager.createClient({ id: "cliente", name: "Cliente", slug: "cliente" });
      const section = await configManager.getSection<{ clients: number }>("client-manager");
      expect(section?.clients).toBe(1);
    });

    it("registra un warning vía logger si la verificación posterior a una mutación falla, sin fallar la operación", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const logs: string[] = [];
      const logger = new Logger("client-manager-test", {
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

      const manager = new ClientManager({
        psnAdapter,
        logger,
        verificationManager: fakeVerificationManager,
      });
      const client = await manager.createClient({
        id: "cliente",
        name: "Cliente",
        slug: "cliente",
      });
      expect(client.id).toBe("cliente");
      expect(logs.some((m) => m.includes("verificación"))).toBe(true);
    });

    it("publica eventos a través de un EventBus real para cada operación de escritura y de referencia", async () => {
      const root = tempDir();
      await makeWorkspaceWithClients(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const eventBus = new EventBus();
      const received: string[] = [];
      for (const phase of [
        "created",
        "updated",
        "deleted",
        "duplicated",
        "archived",
        "restored",
        "reference.added",
        "reference.removed",
      ]) {
        eventBus.subscribe(`client.${phase}`, () => {
          received.push(phase);
        });
      }

      const manager = new ClientManager({ psnAdapter, eventBus });
      await manager.createClient({ id: "cliente", name: "Cliente", slug: "cliente" });
      await manager.updateClient("cliente", { name: "Cliente S.L." });
      await manager.duplicateClient("cliente", "copia", "copia");
      await manager.addReference("cliente", "projects", "p1");
      await manager.removeReference("cliente", "projects", "p1");
      await manager.archiveClient("cliente");
      await manager.restoreClient("cliente");
      await manager.deleteClient("cliente", { confirmPermanent: true });

      expect(received).toEqual([
        "created",
        "updated",
        "duplicated",
        "reference.added",
        "reference.removed",
        "archived",
        "restored",
        "deleted",
      ]);
    });
  });

  describe("IModule", () => {
    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new ClientManager({ psnAdapter: new PSNAdapter(), configManager });

      await core.registerModule(manager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "client-manager", status: "OK" }),
      ]);
      const section = await configManager.getSection<{ integrations: string[] }>("client-manager");
      expect(section?.integrations).toContain("psn-adapter");

      await manager.dispose();
      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });
  });
});
