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
import type { VerificationManager } from "@dwm/verification";
import { KnowledgeManager } from "../../src/KnowledgeManager.js";
import { KnowledgeErrorCode } from "../../src/errors/KnowledgeErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeScannedPSNAdapter, makeWorkspaceWithKnowledge } from "./support/fixtures.js";

describe("KnowledgeManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-knowledge-manager-core-"));
  }

  it("el constructor exige psnAdapter", () => {
    expect(
      () => new KnowledgeManager({} as unknown as ConstructorParameters<typeof KnowledgeManager>[0])
    ).toThrowError(expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_INVALID_REQUEST }));
  });

  describe("resolución del directorio de conocimiento", () => {
    it("lanza KNOWLEDGE_DIRECTORY_UNRESOLVABLE si el Workspace no se ha escaneado", async () => {
      const manager = new KnowledgeManager({ psnAdapter: new PSNAdapter() });
      await expect(manager.listKnowledge()).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_DIRECTORY_UNRESOLVABLE,
      });
    });

    it("lanza KNOWLEDGE_DIRECTORY_UNRESOLVABLE si el Workspace no tiene el recurso psn-knowledge-global", async () => {
      const root = tempDir();
      const { promises: fs } = await import("node:fs");
      await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(manager.listKnowledge()).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_DIRECTORY_UNRESOLVABLE,
      });
    });
  });

  describe("listKnowledge()", () => {
    it("lista los elementos reales del Workspace, excluyendo archivados por defecto", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {
        "activa.md": "# Activa\n",
        "legada.md": "# Legada\n",
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });

      const list = await manager.listKnowledge();
      expect(list.map((s) => s.id).sort()).toEqual(["activa.md", "legada.md"]);

      await manager.archiveKnowledge("activa.md");
      expect((await manager.listKnowledge()).map((s) => s.id)).toEqual(["legada.md"]);
      expect(
        (await manager.listKnowledge({ includeArchived: true })).map((s) => s.id).sort()
      ).toEqual(["activa.md", "legada.md"]);
    });

    it("extrae el título de cada elemento para su resumen", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "con-titulo.md": "# Mi Título\nCuerpo.\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      const [summary] = await manager.listKnowledge();
      expect(summary?.title).toBe("Mi Título");
    });

    it("lista elementos anidados en subcarpetas con su id como ruta relativa", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "guias/onboarding.md": "# Onboarding\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      expect((await manager.listKnowledge()).map((s) => s.id)).toEqual(["guias/onboarding.md"]);
    });

    it("devuelve [] si el recurso de conocimiento está vacío", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      expect(await manager.listKnowledge()).toEqual([]);
    });
  });

  describe("getKnowledge() / getKnowledgeContent() / getKnowledgeMetadata()", () => {
    it("lee un elemento existente con su contenido y metadatos", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "soporte.md": "# Soporte\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });

      const item = await manager.getKnowledge("soporte.md");
      expect(item.id).toBe("soporte.md");
      expect(item.content).toBe("# Soporte\n");
      expect(item.metadata.archived).toBe(false);

      expect(await manager.getKnowledgeContent("soporte.md")).toBe("# Soporte\n");
      expect(await manager.getKnowledgeMetadata("soporte.md")).toEqual(item.metadata);
    });

    it("lanza KNOWLEDGE_NOT_FOUND si el elemento no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(manager.getKnowledge("no-existe.md")).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND,
      });
    });

    it("lanza KNOWLEDGE_INVALID_ID para un id sintácticamente inseguro", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(manager.getKnowledge("../fuera.md")).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_INVALID_ID,
      });
    });
  });

  describe("createKnowledge()", () => {
    it("crea un elemento nuevo con metadatos iniciales, normalizando etiquetas", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });

      const item = await manager.createKnowledge({
        id: "nueva.md",
        content: "# Nueva\n",
        tags: ["Backend", "backend"],
        category: "Guías",
      });
      expect(item.metadata.archived).toBe(false);
      expect(item.metadata.createdAt).toBe(item.metadata.updatedAt);
      expect(item.metadata.tags).toEqual(["backend"]);
      expect(item.metadata.category).toBe("Guías");

      expect((await manager.getKnowledge("nueva.md")).content).toBe("# Nueva\n");
    });

    it("crea un elemento anidado, generando las carpetas necesarias", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      const item = await manager.createKnowledge({ id: "guias/nueva.md", content: "# Nueva\n" });
      expect(item.id).toBe("guias/nueva.md");
    });

    it("lanza KNOWLEDGE_ALREADY_EXISTS si el id ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "existente.md": "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(
        manager.createKnowledge({ id: "existente.md", content: "# Y\n" })
      ).rejects.toMatchObject({ code: KnowledgeErrorCode.KNOWLEDGE_ALREADY_EXISTS });
    });

    it("lanza KNOWLEDGE_VALIDATION_FAILED si el contenido ya usa el frontmatter reservado dwm:", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(
        manager.createKnowledge({ id: "mala.md", content: "---\ndwm:\n  archived: true\n---\nX\n" })
      ).rejects.toMatchObject({ code: KnowledgeErrorCode.KNOWLEDGE_VALIDATION_FAILED });
    });

    it("lanza KNOWLEDGE_INVALID_TAG / KNOWLEDGE_INVALID_CATEGORY para metadatos inválidos", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(
        manager.createKnowledge({ id: "a.md", content: "x", tags: ["a,b"] })
      ).rejects.toMatchObject({ code: KnowledgeErrorCode.KNOWLEDGE_INVALID_TAG });
      await expect(
        manager.createKnowledge({ id: "a.md", content: "x", category: "" })
      ).rejects.toMatchObject({ code: KnowledgeErrorCode.KNOWLEDGE_INVALID_CATEGORY });
    });
  });

  describe("updateKnowledge() / updateKnowledgeMetadata() / saveKnowledge()", () => {
    it("actualiza el contenido preservando createdAt y avanzando updatedAt", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "nota.md": "# Original\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      const original = await manager.getKnowledge("nota.md");

      await new Promise((resolve) => setTimeout(resolve, 5));
      const actualizada = await manager.updateKnowledge("nota.md", "# Editada\n");
      expect(actualizada.content).toBe("# Editada\n");
      expect(actualizada.metadata.createdAt).toBe(original.metadata.createdAt);
      expect(actualizada.metadata.updatedAt).not.toBe(original.metadata.createdAt);
    });

    it("lanza KNOWLEDGE_NOT_FOUND al actualizar un elemento inexistente", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(manager.updateKnowledge("no-existe.md", "# X\n")).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND,
      });
    });

    it("updateKnowledgeMetadata() cambia tags/categoría sin tocar el contenido", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "nota.md": "# Original\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });

      const updated = await manager.updateKnowledgeMetadata("nota.md", {
        tags: ["nuevo"],
        category: "Archivo",
      });
      expect(updated.content).toBe("# Original\n");
      expect(updated.metadata.tags).toEqual(["nuevo"]);
      expect(updated.metadata.category).toBe("Archivo");

      const cleared = await manager.updateKnowledgeMetadata("nota.md", { category: null });
      expect(cleared.metadata.category).toBeUndefined();
    });

    it("saveKnowledge() persiste un KnowledgeItem completo ya materializado", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "nota.md": "# Original\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      const item = await manager.getKnowledge("nota.md");

      const saved = await manager.saveKnowledge({ ...item, content: "# Guardada\n" });
      expect(saved.content).toBe("# Guardada\n");
      expect((await manager.getKnowledge("nota.md")).content).toBe("# Guardada\n");
    });

    it("saveKnowledge() rechaza una estructura inválida", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(
        manager.saveKnowledge({
          id: "..",
          content: "# X\n",
          metadata: {
            archived: false,
            createdAt: "x",
            updatedAt: "x",
            tags: [],
            relations: [],
          },
        })
      ).rejects.toMatchObject({ code: KnowledgeErrorCode.KNOWLEDGE_INVALID_STRUCTURE });
    });
  });

  describe("duplicateKnowledge()", () => {
    it("duplica un elemento existente con un nuevo id, copiando tags/categoría y reiniciando relaciones", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {
        "origen.md": "# Original\n",
        "otro.md": "# Otro\n",
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await manager.updateKnowledgeMetadata("origen.md", { tags: ["backend"], category: "Guías" });
      await manager.addRelation("origen.md", "otro.md");

      const duplicada = await manager.duplicateKnowledge("origen.md", "copia.md");
      expect(duplicada.id).toBe("copia.md");
      expect(duplicada.content).toBe("# Original\n");
      expect(duplicada.metadata.archived).toBe(false);
      expect(duplicada.metadata.tags).toEqual(["backend"]);
      expect(duplicada.metadata.category).toBe("Guías");
      expect(duplicada.metadata.relations).toEqual([]);

      expect((await manager.getKnowledge("origen.md")).content).toBe("# Original\n");
    });

    it("lanza KNOWLEDGE_NOT_FOUND si el origen no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(manager.duplicateKnowledge("no-existe.md", "copia.md")).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND,
      });
    });

    it("lanza KNOWLEDGE_ALREADY_EXISTS si el destino ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "a.md": "# A\n", "b.md": "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(manager.duplicateKnowledge("a.md", "b.md")).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_ALREADY_EXISTS,
      });
    });
  });

  describe("deleteKnowledge()", () => {
    it("exige confirmPermanent: true y elimina el fichero exacto", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "nota.md": "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });

      await expect(
        manager.deleteKnowledge("nota.md", { confirmPermanent: false })
      ).rejects.toMatchObject({ code: KnowledgeErrorCode.KNOWLEDGE_DELETE_NOT_CONFIRMED });

      await manager.deleteKnowledge("nota.md", { confirmPermanent: true });
      await expect(manager.getKnowledge("nota.md")).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND,
      });
    });

    it("lanza KNOWLEDGE_NOT_FOUND si no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(
        manager.deleteKnowledge("no-existe.md", { confirmPermanent: true })
      ).rejects.toMatchObject({ code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND });
    });
  });

  describe("archiveKnowledge() / restoreKnowledge()", () => {
    it("archiva y restaura un elemento sin mover ni renombrar su fichero", async () => {
      const root = tempDir();
      const knowledgeDir = await makeWorkspaceWithKnowledge(root, { "nota.md": "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });

      const archivada = await manager.archiveKnowledge("nota.md");
      expect(archivada.metadata.archived).toBe(true);
      expect(typeof archivada.metadata.archivedAt).toBe("string");

      const { promises: fs } = await import("node:fs");
      expect(await fs.readdir(knowledgeDir)).toEqual(["nota.md"]);

      const restaurada = await manager.restoreKnowledge("nota.md");
      expect(restaurada.metadata.archived).toBe(false);
      expect(restaurada.metadata.archivedAt).toBeUndefined();
      expect(restaurada.content).toBe("# X\n");
    });

    it("preserva el frontmatter propio del autor al archivar", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "nota.md": "---\ntitle: Mi Nota\n---\n# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });

      const archivada = await manager.archiveKnowledge("nota.md");
      expect(archivada.content).toContain("title: Mi Nota");
    });

    it("lanza KNOWLEDGE_ALREADY_ARCHIVED si ya está archivado", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "nota.md": "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await manager.archiveKnowledge("nota.md");
      await expect(manager.archiveKnowledge("nota.md")).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_ALREADY_ARCHIVED,
      });
    });

    it("lanza KNOWLEDGE_NOT_ARCHIVED si no está archivado", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "nota.md": "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(manager.restoreKnowledge("nota.md")).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_NOT_ARCHIVED,
      });
    });
  });

  describe("searchKnowledge() / filterKnowledge() / listTags() / listCategories()", () => {
    it("busca por texto libre sobre el índice reconstruido", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {
        "nota-soporte.md": "# Soporte\n",
        "nota-ventas.md": "# Ventas\n",
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      expect((await manager.searchKnowledge("soporte")).map((s) => s.id)).toEqual([
        "nota-soporte.md",
      ]);
    });

    it("filtra por estado archivado, categoría y etiquetas", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "a.md": "# A\n", "b.md": "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await manager.updateKnowledgeMetadata("a.md", { tags: ["backend"], category: "Guías" });
      await manager.archiveKnowledge("b.md");

      expect((await manager.filterKnowledge({ archived: true })).map((s) => s.id)).toEqual([
        "b.md",
      ]);
      expect((await manager.filterKnowledge({ category: "guías" })).map((s) => s.id)).toEqual([
        "a.md",
      ]);
      expect((await manager.filterKnowledge({ tags: ["backend"] })).map((s) => s.id)).toEqual([
        "a.md",
      ]);
    });

    it("listTags()/listCategories() agregan metadatos de todo el índice", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await manager.createKnowledge({
        id: "a.md",
        content: "x",
        tags: ["backend"],
        category: "Guías",
      });
      expect(await manager.listTags()).toEqual(["backend"]);
      expect(await manager.listCategories()).toEqual(["Guías"]);
    });
  });

  describe("listTree()", () => {
    it("expone la navegación jerárquica completa, incluidos ficheros no reconocidos", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {
        "nota.md": "# Nota\n",
        "guias/onboarding.md": "# Onboarding\n",
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      const { promises: fs } = await import("node:fs");
      await fs.writeFile(path.join(root, "PSN-KNOWLEDGE-GLOBAL", "adjunto.pdf"), "bin", "utf-8");

      const tree = await manager.listTree();
      const names = tree.map((node) => node.name).sort();
      expect(names).toEqual(["adjunto.pdf", "guias", "nota.md"]);

      const guias = tree.find((node) => node.name === "guias");
      expect(guias?.isDirectory).toBe(true);
      expect(guias?.children?.[0]?.relativePath).toBe("guias/onboarding.md");
      expect(guias?.children?.[0]?.recognized).toBe(true);

      const pdf = tree.find((node) => node.name === "adjunto.pdf");
      expect(pdf?.recognized).toBe(false);
    });
  });

  describe("findDuplicatesByName() / findDuplicatesByPath()", () => {
    it("detecta nombres duplicados en distintas carpetas y ausencia de colisiones de ruta", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {
        "guias/onboarding.md": "# G\n",
        "otra/onboarding.md": "# O\n",
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });

      const byName = await manager.findDuplicatesByName();
      expect(byName).toHaveLength(1);
      expect(byName[0]?.ids.slice().sort()).toEqual(["guias/onboarding.md", "otra/onboarding.md"]);
      expect(await manager.findDuplicatesByPath()).toEqual([]);
    });
  });

  describe("relaciones", () => {
    it("addRelation()/removeRelation()/listRelations() gestionan relaciones simples y dirigidas", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "a.md": "# A\n", "b.md": "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });

      await manager.addRelation("a.md", "b.md");
      expect((await manager.listRelations("a.md")).outgoing).toEqual(["b.md"]);
      expect((await manager.listRelations("b.md")).incoming).toEqual(["a.md"]);

      await manager.removeRelation("a.md", "b.md");
      expect((await manager.listRelations("a.md")).outgoing).toEqual([]);
    });

    it("addRelation() rechaza relaciones consigo mismo o hacia un id inexistente", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "a.md": "# A\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(manager.addRelation("a.md", "a.md")).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_SELF_RELATION,
      });
      await expect(manager.addRelation("a.md", "no-existe.md")).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND,
      });
    });

    it("removeRelation() lanza KNOWLEDGE_RELATION_NOT_FOUND si no existía", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "a.md": "# A\n", "b.md": "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      await expect(manager.removeRelation("a.md", "b.md")).rejects.toMatchObject({
        code: KnowledgeErrorCode.KNOWLEDGE_RELATION_NOT_FOUND,
      });
    });
  });

  describe("validateKnowledgeStructure()", () => {
    it("delega en KnowledgeValidator", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "nota.md": "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new KnowledgeManager({ psnAdapter });
      const item = await manager.getKnowledge("nota.md");
      expect(manager.validateKnowledgeStructure(item).valid).toBe(true);
    });
  });

  describe("toStatusProvider()", () => {
    it("informa UNKNOWN si el Workspace no se ha escaneado, y OK con el recuento en caso contrario", async () => {
      const manager = new KnowledgeManager({ psnAdapter: new PSNAdapter() });
      const unknown = await manager.toStatusProvider().getStatus();
      expect(unknown.level).toBe("UNKNOWN");

      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "a.md": "# A\n", "b.md": "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const managerConConocimiento = new KnowledgeManager({ psnAdapter });
      await managerConConocimiento.listKnowledge();
      const ok = await managerConConocimiento.toStatusProvider().getStatus();
      expect(ok.level).toBe("OK");
      expect(ok.detail?.["items"]).toBe(2);
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
      const manager = new KnowledgeManager({
        psnAdapter: new PSNAdapter(),
        configManager,
        workspacePaths,
        importManager,
        agentManager,
        skillManager,
        ruleManager,
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
        ])
      );
    });

    it("persiste su sección de configuración tras cada mutación", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new KnowledgeManager({ psnAdapter, configManager });

      await manager.createKnowledge({ id: "nota.md", content: "# X\n" });
      const section = await configManager.getSection<{ items: number }>("knowledge-manager");
      expect(section?.items).toBe(1);
    });

    it("registra un warning vía logger si la verificación posterior a una mutación falla, sin fallar la operación", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const logs: string[] = [];
      const logger = new Logger("knowledge-manager-test", {
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

      const manager = new KnowledgeManager({
        psnAdapter,
        logger,
        verificationManager: fakeVerificationManager,
      });
      const item = await manager.createKnowledge({ id: "nota.md", content: "# X\n" });
      expect(item.id).toBe("nota.md");
      expect(logs.some((m) => m.includes("verificación"))).toBe(true);
    });

    it("publica eventos a través de un EventBus real para cada operación de escritura y de relación", async () => {
      const root = tempDir();
      await makeWorkspaceWithKnowledge(root, { "otra.md": "# Otra\n" });
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
        "relation.added",
        "relation.removed",
      ]) {
        eventBus.subscribe(`knowledge.${phase}`, () => {
          received.push(phase);
        });
      }

      const manager = new KnowledgeManager({ psnAdapter, eventBus });
      await manager.createKnowledge({ id: "nota.md", content: "# X\n" });
      await manager.updateKnowledge("nota.md", "# Y\n");
      await manager.duplicateKnowledge("nota.md", "copia.md");
      await manager.addRelation("nota.md", "otra.md");
      await manager.removeRelation("nota.md", "otra.md");
      await manager.archiveKnowledge("nota.md");
      await manager.restoreKnowledge("nota.md");
      await manager.deleteKnowledge("nota.md", { confirmPermanent: true });

      expect(received).toEqual([
        "created",
        "updated",
        "duplicated",
        "relation.added",
        "relation.removed",
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
      const manager = new KnowledgeManager({ psnAdapter: new PSNAdapter(), configManager });

      await core.registerModule(manager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "knowledge-manager", status: "OK" }),
      ]);
      const section = await configManager.getSection<{ integrations: string[] }>(
        "knowledge-manager"
      );
      expect(section?.integrations).toContain("psn-adapter");

      await manager.dispose();
      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });
  });
});
