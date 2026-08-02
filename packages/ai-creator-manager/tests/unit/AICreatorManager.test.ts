import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import { AICreatorManager } from "../../src/AICreatorManager.js";
import { NullAIProvider, type AIProvider } from "../../src/ProviderInterface.js";
import { CreationError } from "../../src/errors/CreationError.js";
import { CreationErrorCode } from "../../src/errors/CreationErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeHarness, type TestHarness } from "./support/fixtures.js";

describe("AICreatorManager", () => {
  let temp: ReturnType<typeof makeTempDir>;
  let harness: TestHarness;

  beforeEach(async () => {
    temp = makeTempDir();
    harness = await makeHarness(temp.dir);
  });

  afterEach(() => {
    temp.cleanup();
  });

  it("acepta logger, eventBus y verificationManager y los usa al crear", async () => {
    const { Logger, LogLevel } = await import("@dwm/logger");
    const { EventBus } = await import("@dwm/event-bus");
    const logs: string[] = [];
    const logger = new Logger("aicm-test", {
      minLevel: LogLevel.INFO,
      transports: [{ write: async (entry) => void logs.push(entry.message) }],
    });
    const eventBus = new EventBus();
    const events: string[] = [];
    eventBus.subscribe("creation.*", (envelope) => {
      events.push(envelope.type);
    });
    const fakeVerificationManager = { verify: async () => ({ ok: true }) } as never;

    const creatorWithExtras = new AICreatorManager({
      agentManager: harness.agentManager,
      logger,
      eventBus,
      verificationManager: fakeVerificationManager,
    });
    const result = await creatorWithExtras.createAgent({ id: "extra-agent", data: {} });
    expect(result.created).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    expect(events).toContain("creation.completed");
    expect(creatorWithExtras.listConnectedIntegrations()).toContain("verification");
  });

  it("createStructure ignora huecos vacíos en la lista de elementos", async () => {
    const result = await harness.creator.createStructure({
      items: [{ kind: "agent", payload: { id: "gap-agent", data: {} } }, undefined as never],
    });
    expect(result.results).toHaveLength(1);
    expect(result.failedAt).toBeUndefined();
  });

  it("expone id/version/contractVersion como IModule", () => {
    expect(harness.creator.id).toBe("ai-creator-manager");
    expect(harness.creator.version).toBe("1.0.0");
    expect(harness.creator.contractVersion).toBe("1.0.0");
  });

  it("crea recursos de cada tipo mediante los atajos createX", async () => {
    const agent = await harness.creator.createAgent({ id: "a1", data: { name: "A" } });
    expect(agent.created).toBe(true);

    const skill = await harness.creator.createSkill({ id: "s1", content: "# S1\n" });
    expect(skill.created).toBe(true);

    const rule = await harness.creator.createRule({ id: "r1", content: "# R1\n" });
    expect(rule.created).toBe(true);

    const knowledge = await harness.creator.createKnowledge({ id: "k1.md", content: "# K1\n" });
    expect(knowledge.created).toBe(true);

    const client = await harness.creator.createClient({ name: "Acme" });
    expect(client.created).toBe(true);

    const project = await harness.creator.createProject({
      name: "P1",
      description: "D",
      projectPath: temp.dir,
      profileId: "profile-1",
    });
    expect(project.created).toBe(true);

    const template = await harness.creator.createTemplate({
      id: "tpl-1",
      targetKind: "skill",
      content: "# {{x}}",
    });
    expect(template.created).toBe(true);
  });

  it("previewCreation delega en la vista previa del pipeline", async () => {
    const preview = await harness.creator.previewCreation({
      kind: "agent",
      payload: { id: "a1", data: {} },
    });
    expect(preview.kind).toBe("agent");
    expect(preview.resolvedId).toBe("a1");
    await expect(harness.agentManager.getAgent("a1")).rejects.toThrow();
  });

  // ---------------------------------------------------------------------
  // Estructuras completas
  // ---------------------------------------------------------------------

  it("createStructure crea varios recursos relacionados en orden", async () => {
    const result = await harness.creator.createStructure({
      items: [
        { kind: "agent", payload: { id: "struct-agent", data: {} } },
        { kind: "skill", payload: { id: "struct-skill", content: "# hola" } },
      ],
    });
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.created)).toBe(true);
    expect(result.failedAt).toBeUndefined();
  });

  it("createStructure se detiene en el primer fallo y reporta failedAt", async () => {
    const result = await harness.creator.createStructure({
      items: [
        { kind: "agent", payload: { id: "struct-ok", data: {} } },
        { kind: "agent", payload: { id: "struct-ok", data: {} } }, // conflicto: id duplicado
        { kind: "skill", payload: { id: "nunca-se-crea", content: "x" } },
      ],
    });
    expect(result.results).toHaveLength(1);
    expect(result.failedAt).toBe(1);
    expect(result.error).toBeDefined();
    await expect(harness.skillManager.getSkill("nunca-se-crea")).rejects.toThrow();
  });

  it("createStructure respeta dryRun para todos los elementos", async () => {
    const result = await harness.creator.createStructure(
      { items: [{ kind: "agent", payload: { id: "dry-struct", data: {} } }] },
      { dryRun: true }
    );
    expect(result.dryRun).toBe(true);
    expect(result.results[0]?.created).toBe(false);
    await expect(harness.agentManager.getAgent("dry-struct")).rejects.toThrow();
  });

  // ---------------------------------------------------------------------
  // Cancelación y consulta de operaciones
  // ---------------------------------------------------------------------

  it("cancel/getOperation/listOperations reflejan el ciclo de vida de una operación", async () => {
    const preview = await harness.creator.previewCreation({
      kind: "agent",
      payload: { id: "op-agent", data: {} },
    });
    expect(harness.creator.getOperation(preview.operationId)?.state).toBe("previewed");
    expect(await harness.creator.cancel(preview.operationId)).toBe(true);
    expect(harness.creator.getOperation(preview.operationId)?.state).toBe("cancelled");
    expect(harness.creator.listOperations().length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------
  // Plantillas
  // ---------------------------------------------------------------------

  it("registerTemplate/getTemplate/listTemplates/removeTemplate gestionan plantillas", () => {
    harness.creator.registerTemplate({ id: "tpl-1", targetKind: "skill", content: "# {{x}}" });
    expect(harness.creator.getTemplate("tpl-1")?.id).toBe("tpl-1");
    expect(harness.creator.listTemplates("skill")).toHaveLength(1);
    expect(harness.creator.listTemplates("rule")).toHaveLength(0);
    harness.creator.removeTemplate("tpl-1");
    expect(harness.creator.getTemplate("tpl-1")).toBeUndefined();
  });

  // ---------------------------------------------------------------------
  // Prompts
  // ---------------------------------------------------------------------

  it("registerPrompt/getPrompt/listPrompts/removePrompt gestionan prompts", () => {
    harness.creator.registerPrompt({ id: "prompt-1", kind: "skill", template: "hola {{x}}" });
    expect(harness.creator.getPrompt("prompt-1")?.id).toBe("prompt-1");
    expect(harness.creator.listPrompts("skill")).toHaveLength(1);
    harness.creator.removePrompt("prompt-1");
    expect(harness.creator.getPrompt("prompt-1")).toBeUndefined();
  });

  // ---------------------------------------------------------------------
  // Proveedores de IA
  // ---------------------------------------------------------------------

  it('el proveedor "null" está registrado por defecto y no puede eliminarse', () => {
    expect(harness.creator.listProviders()).toContain("null");
    harness.creator.removeProvider("null");
    expect(harness.creator.listProviders()).toContain("null");
  });

  it("registerProvider añade un proveedor intercambiable; getProvider/listProviders/removeProvider lo gestionan", () => {
    const fake: AIProvider = { id: "fake", generate: async () => ({ content: "x" }) };
    harness.creator.registerProvider(fake);
    expect(harness.creator.getProvider("fake")).toBe(fake);
    expect(harness.creator.listProviders()).toContain("fake");
    harness.creator.removeProvider("fake");
    expect(harness.creator.getProvider("fake")).toBeUndefined();
  });

  it("registerProvider lanza si el id ya está registrado", () => {
    const fake: AIProvider = { id: "fake", generate: async () => ({ content: "x" }) };
    harness.creator.registerProvider(fake);
    expect(() => harness.creator.registerProvider(fake)).toThrow(CreationError);
    try {
      harness.creator.registerProvider(fake);
    } catch (err) {
      expect((err as CreationError).code).toBe(
        CreationErrorCode.CREATION_PROVIDER_ALREADY_REGISTERED
      );
    }
  });

  it("usa un proveedor registrado a través de create() con promptId/providerId", async () => {
    harness.creator.registerPrompt({ id: "prompt-1", kind: "skill", template: "sobre {{tema}}" });
    const fake: AIProvider = {
      id: "fake",
      generate: async (request) => ({ content: `contenido ${request.prompt}` }),
    };
    harness.creator.registerProvider(fake);
    const result = await harness.creator.create({
      kind: "skill",
      payload: {
        id: "s-provider",
        promptId: "prompt-1",
        providerId: "fake",
        variables: { tema: "SEO" },
      },
    });
    expect(result.created).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Integraciones y estado
  // ---------------------------------------------------------------------

  it("listConnectedIntegrations refleja los managers configurados", () => {
    const integrations = harness.creator.listConnectedIntegrations();
    expect(integrations).toContain("agent-manager");
    expect(integrations).toContain("client-manager");
    expect(integrations).toContain("project");
  });

  it("listConnectedIntegrations no incluye lo que no está configurado", () => {
    const bare = new AICreatorManager();
    expect(bare.listConnectedIntegrations()).toEqual([]);
  });

  it("toStatusProvider reporta OK con datos agregados", async () => {
    const provider = harness.creator.toStatusProvider();
    const status = await provider.getStatus();
    expect(status.level).toBe("OK");
    expect(status.detail).toMatchObject({ integrations: expect.any(Array) });
  });

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  it("init() reporta estado OK y guarda la sección de configuración si hay ConfigManager", async () => {
    const sections: Record<string, unknown> = {};
    const fakeConfigManager = {
      setSection: async (namespace: string, value: unknown) => {
        sections[namespace] = value;
      },
    } as never;
    const creatorWithConfig = new AICreatorManager({
      agentManager: harness.agentManager,
      configManager: fakeConfigManager,
    });

    let reportedStatus: SystemStatus | undefined;
    const context: ModuleContext = {
      getConfig: () => ({}) as never,
      reportStatus: (status: SystemStatus) => {
        reportedStatus = status;
      },
    } as unknown as ModuleContext;

    await creatorWithConfig.init(context);
    expect(reportedStatus).toBe(SystemStatus.OK);
    expect(sections["ai-creator-manager"]).toMatchObject({
      integrations: ["agent-manager", "config"],
    });
  });

  it("dispose() no lanza (no hay tareas propias que cancelar)", async () => {
    await expect(harness.creator.dispose()).resolves.toBeUndefined();
  });

  // ---------------------------------------------------------------------
  // Proveedor por defecto (sin llamadas reales a IA)
  // ---------------------------------------------------------------------

  it("el proveedor por defecto es un NullAIProvider que nunca implementa llamadas reales", () => {
    const provider = harness.creator.getProvider("null");
    expect(provider).toBeInstanceOf(NullAIProvider);
  });
});
