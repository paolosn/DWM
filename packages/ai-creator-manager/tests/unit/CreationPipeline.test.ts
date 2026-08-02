import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "@dwm/event-bus";
import { Logger, LogLevel } from "@dwm/logger";
import { CreationPipeline } from "../../src/CreationPipeline.js";
import { CreationRegistry } from "../../src/CreationRegistry.js";
import { CreationTemplateRegistry } from "../../src/CreationTemplate.js";
import { PromptRegistry } from "../../src/PromptRegistry.js";
import { NullAIProvider, type AIProvider } from "../../src/ProviderInterface.js";
import { CreationError } from "../../src/errors/CreationError.js";
import { CreationErrorCode } from "../../src/errors/CreationErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeHarness, type TestHarness } from "./support/fixtures.js";

describe("CreationPipeline", () => {
  let temp: ReturnType<typeof makeTempDir>;
  let harness: TestHarness;
  let templateRegistry: CreationTemplateRegistry;
  let promptRegistry: PromptRegistry;
  let providers: Map<string, AIProvider>;
  let registry: CreationRegistry;
  let pipeline: CreationPipeline;

  beforeEach(async () => {
    temp = makeTempDir();
    harness = await makeHarness(temp.dir);
    templateRegistry = new CreationTemplateRegistry();
    promptRegistry = new PromptRegistry();
    const nullProvider = new NullAIProvider();
    providers = new Map([[nullProvider.id, nullProvider]]);
    registry = new CreationRegistry();
    pipeline = new CreationPipeline({
      agentManager: harness.agentManager,
      skillManager: harness.skillManager,
      ruleManager: harness.ruleManager,
      knowledgeManager: harness.knowledgeManager,
      clientManager: harness.clientManager,
      projectManager: harness.projectManager,
      templateRegistry,
      promptRegistry,
      resolveProvider: (id) => providers.get(id),
      registry,
    });
  });

  afterEach(() => {
    temp.cleanup();
  });

  // ---------------------------------------------------------------------
  // Creación básica por tipo de recurso
  // ---------------------------------------------------------------------

  it("crea un agente con datos manuales", async () => {
    const result = await pipeline.create({
      kind: "agent",
      payload: { id: "mi-agente", data: { name: "Mi Agente" } },
    });
    expect(result.created).toBe(true);
    expect(result.id).toBe("mi-agente");
    const agent = await harness.agentManager.getAgent("mi-agente");
    expect(agent.data).toEqual({ name: "Mi Agente" });
  });

  it("crea una skill con contenido manual", async () => {
    const result = await pipeline.create({
      kind: "skill",
      payload: { id: "mi-skill", content: "# Mi Skill\n" },
    });
    expect(result.created).toBe(true);
    const skill = await harness.skillManager.getSkill("mi-skill");
    expect(skill.id).toBe("mi-skill");
  });

  it("crea una regla con contenido manual", async () => {
    const result = await pipeline.create({
      kind: "rule",
      payload: { id: "mi-regla", content: "# Mi Regla\n" },
    });
    expect(result.created).toBe(true);
    await expect(harness.ruleManager.getRule("mi-regla")).resolves.toBeDefined();
  });

  it("crea conocimiento con tags y categoría", async () => {
    const result = await pipeline.create({
      kind: "knowledge",
      payload: { id: "mi-nota.md", content: "# Nota\n", tags: ["seo"], category: "marketing" },
    });
    expect(result.created).toBe(true);
    const item = await harness.knowledgeManager.getKnowledge("mi-nota.md");
    expect(item.metadata.tags).toContain("seo");
  });

  it("crea un cliente derivando id y slug del nombre", async () => {
    const result = await pipeline.create({ kind: "client", payload: { name: "Acme Corp" } });
    expect(result.created).toBe(true);
    expect(result.id).toBe("acme-corp");
    const client = await harness.clientManager.getClient("acme-corp");
    expect(client.slug).toBe("acme-corp");
  });

  it("ignora un status de cliente desconocido y avisa con un warning", async () => {
    const preview = await pipeline.preview({
      kind: "client",
      payload: { name: "Acme", status: "bogus" },
    });
    expect(preview.warnings.some((w) => w.field === "status")).toBe(true);
  });

  it("crea un proyecto delegando en ProjectManager", async () => {
    const result = await pipeline.create({
      kind: "project",
      payload: {
        name: "Proyecto X",
        description: "Descripción",
        projectPath: temp.dir,
        profileId: "profile-1",
      },
    });
    expect(result.created).toBe(true);
  });

  it("registra una plantilla nueva a través del kind template", async () => {
    const result = await pipeline.create({
      kind: "template",
      payload: { id: "tpl-skill-1", targetKind: "skill", content: "# {{title}}" },
    });
    expect(result.created).toBe(true);
    expect(templateRegistry.has("tpl-skill-1")).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Resolución por plantilla
  // ---------------------------------------------------------------------

  it("resuelve el contenido de una skill a partir de una plantilla registrada", async () => {
    templateRegistry.register({
      id: "tpl-skill",
      targetKind: "skill",
      content: "# {{title}}\n\nPara {{client}}.",
    });
    const result = await pipeline.create({
      kind: "skill",
      payload: {
        id: "skill-desde-plantilla",
        templateId: "tpl-skill",
        variables: { title: "SEO", client: "MCI" },
      },
    });
    expect(result.created).toBe(true);
    const file = await harness.skillManager.getSkillFile("skill-desde-plantilla");
    expect(file).toContain("# SEO");
    expect(file).toContain("Para MCI.");
  });

  it("resuelve los datos de un agente a partir de una plantilla registrada", async () => {
    templateRegistry.register({
      id: "tpl-agent",
      targetKind: "agent",
      data: { name: "{{name}}", role: "asistente" },
    });
    const result = await pipeline.create({
      kind: "agent",
      payload: { id: "agente-plantilla", templateId: "tpl-agent", variables: { name: "Ana" } },
    });
    expect(result.created).toBe(true);
    const agent = await harness.agentManager.getAgent("agente-plantilla");
    expect(agent.data).toEqual({ name: "Ana", role: "asistente" });
  });

  it("avisa si la plantilla usada no coincide con el tipo de recurso", async () => {
    templateRegistry.register({ id: "tpl-rule", targetKind: "rule", content: "# {{x}}" });
    const preview = await pipeline.preview({
      kind: "skill",
      payload: { id: "s1", templateId: "tpl-rule", variables: { x: "y" } },
    });
    expect(preview.warnings.some((w) => w.field === "templateId")).toBe(true);
  });

  it("lanza CREATION_TEMPLATE_NOT_FOUND si templateId no existe", async () => {
    await expect(
      pipeline.create({ kind: "skill", payload: { id: "s1", templateId: "no-existe" } })
    ).rejects.toThrow(CreationError);
  });

  it("lanza si se indica más de una fuente de contenido", async () => {
    templateRegistry.register({ id: "tpl-x", targetKind: "skill", content: "x" });
    await expect(
      pipeline.create({
        kind: "skill",
        payload: { id: "s1", content: "manual", templateId: "tpl-x" },
      })
    ).rejects.toMatchObject({ code: CreationErrorCode.CREATION_INVALID_REQUEST });
  });

  it("lanza si no se indica ninguna fuente de contenido", async () => {
    await expect(pipeline.create({ kind: "skill", payload: { id: "s1" } })).rejects.toMatchObject({
      code: CreationErrorCode.CREATION_INVALID_REQUEST,
    });
  });

  it("lanza si la plantilla de un agente no define datos", async () => {
    templateRegistry.register({ id: "tpl-no-data", targetKind: "agent", content: "x" });
    await expect(
      pipeline.create({ kind: "agent", payload: { id: "a1", templateId: "tpl-no-data" } })
    ).rejects.toThrow(CreationError);
  });

  it("lanza si la plantilla de una skill no define contenido", async () => {
    templateRegistry.register({ id: "tpl-no-content", targetKind: "skill", data: { x: 1 } });
    await expect(
      pipeline.create({ kind: "skill", payload: { id: "s1", templateId: "tpl-no-content" } })
    ).rejects.toThrow(CreationError);
  });

  // ---------------------------------------------------------------------
  // Resolución por proveedor de IA (prompt + provider)
  // ---------------------------------------------------------------------

  it("lanza CREATION_PROVIDER_NOT_FOUND si el providerId no está registrado", async () => {
    promptRegistry.register({ id: "prompt-1", kind: "skill", template: "hola" });
    await expect(
      pipeline.create({
        kind: "skill",
        payload: { id: "s1", promptId: "prompt-1", providerId: "inexistente" },
      })
    ).rejects.toMatchObject({ code: CreationErrorCode.CREATION_PROVIDER_NOT_FOUND });
  });

  it("usa el proveedor registrado para resolver el contenido de una skill", async () => {
    promptRegistry.register({ id: "prompt-1", kind: "skill", template: "Genera sobre {{tema}}" });
    const fakeProvider: AIProvider = {
      id: "fake",
      generate: async (request) => ({ content: `contenido: ${request.prompt}` }),
    };
    providers.set(fakeProvider.id, fakeProvider);
    const result = await pipeline.create({
      kind: "skill",
      payload: { id: "s1", promptId: "prompt-1", providerId: "fake", variables: { tema: "SEO" } },
    });
    expect(result.created).toBe(true);
    const file = await harness.skillManager.getSkillFile("s1");
    expect(file).toBe("contenido: Genera sobre SEO");
  });

  it("usa el proveedor por defecto (null) que siempre falla, si no se indica providerId", async () => {
    promptRegistry.register({ id: "prompt-1", kind: "skill", template: "hola" });
    await expect(
      pipeline.create({ kind: "skill", payload: { id: "s1", promptId: "prompt-1" } })
    ).rejects.toMatchObject({ code: CreationErrorCode.CREATION_PROVIDER_NOT_IMPLEMENTED });
  });

  it("usa el proveedor registrado para resolver los datos de un agente en JSON", async () => {
    promptRegistry.register({ id: "prompt-agent", kind: "agent", template: "crea {{name}}" });
    const fakeProvider: AIProvider = {
      id: "fake",
      generate: async () => ({ content: JSON.stringify({ name: "Ana" }) }),
    };
    providers.set(fakeProvider.id, fakeProvider);
    const result = await pipeline.create({
      kind: "agent",
      payload: {
        id: "a1",
        promptId: "prompt-agent",
        providerId: "fake",
        variables: { name: "Ana" },
      },
    });
    expect(result.created).toBe(true);
    const agent = await harness.agentManager.getAgent("a1");
    expect(agent.data).toEqual({ name: "Ana" });
  });

  it("lanza si el proveedor no devuelve JSON válido para los datos de un agente", async () => {
    promptRegistry.register({ id: "prompt-agent", kind: "agent", template: "crea algo" });
    const fakeProvider: AIProvider = { id: "fake", generate: async () => ({ content: "no-json" }) };
    providers.set(fakeProvider.id, fakeProvider);
    await expect(
      pipeline.create({
        kind: "agent",
        payload: { id: "a1", promptId: "prompt-agent", providerId: "fake" },
      })
    ).rejects.toThrow(CreationError);
  });

  it("lanza si no se indica ninguna fuente de datos para un agente", async () => {
    await expect(pipeline.create({ kind: "agent", payload: {} })).rejects.toMatchObject({
      code: CreationErrorCode.CREATION_INVALID_REQUEST,
    });
  });

  it("lanza si se indican más de una fuente de datos para un agente", async () => {
    templateRegistry.register({ id: "tpl-agent2", targetKind: "agent", data: { x: 1 } });
    await expect(
      pipeline.create({
        kind: "agent",
        payload: { id: "a1", data: { y: 2 }, templateId: "tpl-agent2" },
      })
    ).rejects.toMatchObject({ code: CreationErrorCode.CREATION_INVALID_REQUEST });
  });

  // ---------------------------------------------------------------------
  // Conflictos y alternativas
  // ---------------------------------------------------------------------

  it("detecta conflicto de id al crear un agente duplicado", async () => {
    await pipeline.create({ kind: "agent", payload: { id: "dup", data: {} } });
    await expect(
      pipeline.create({ kind: "agent", payload: { id: "dup", data: {} } })
    ).rejects.toMatchObject({ code: CreationErrorCode.CREATION_CONFLICT });
  });

  it("con allowAlternativeId, reintenta automáticamente con un id alternativo", async () => {
    await pipeline.create({ kind: "agent", payload: { id: "dup", data: {} } });
    const result = await pipeline.create(
      { kind: "agent", payload: { id: "dup", data: {} } },
      { allowAlternativeId: true }
    );
    expect(result.created).toBe(true);
    expect(result.id).toBe("dup-2");
  });

  it("detecta conflicto de id al crear un cliente duplicado", async () => {
    await pipeline.create({ kind: "client", payload: { name: "Acme" } });
    const preview = await pipeline.preview({ kind: "client", payload: { name: "Acme" } });
    expect(preview.conflicts.some((c) => c.field === "id")).toBe(true);
  });

  it("detecta conflicto de slug cuando coincide con el de otro cliente ya existente", async () => {
    await pipeline.create({ kind: "client", payload: { name: "Acme" } });
    const preview = await pipeline.preview({
      kind: "client",
      payload: { id: "acme-otro", name: "Acme Otro", slug: "acme" },
    });
    expect(preview.conflicts.some((c) => c.field === "slug")).toBe(true);
  });

  it("detecta conflicto al registrar dos veces la misma plantilla", async () => {
    await pipeline.create({
      kind: "template",
      payload: { id: "tpl-a", targetKind: "skill", content: "x" },
    });
    const preview = await pipeline.preview({
      kind: "template",
      payload: { id: "tpl-a", targetKind: "skill", content: "y" },
    });
    expect(preview.conflicts.some((c) => c.field === "id")).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Dependencias ausentes
  // ---------------------------------------------------------------------

  it("informa de dependencia ausente para skill/rule/knowledge/client/project cuando su manager no está configurado", async () => {
    const bareRegistry = new CreationRegistry();
    const barePipeline = new CreationPipeline({
      templateRegistry: new CreationTemplateRegistry(),
      promptRegistry: new PromptRegistry(),
      resolveProvider: () => undefined,
      registry: bareRegistry,
    });
    const skillPreview = await barePipeline.preview({ kind: "skill", payload: { content: "x" } });
    expect(skillPreview.missingDependencies).toEqual(["skill-manager"]);

    const rulePreview = await barePipeline.preview({ kind: "rule", payload: { content: "x" } });
    expect(rulePreview.missingDependencies).toEqual(["rule-manager"]);

    const knowledgePreview = await barePipeline.preview({
      kind: "knowledge",
      payload: { content: "x" },
    });
    expect(knowledgePreview.missingDependencies).toEqual(["knowledge-manager"]);

    const clientPreview = await barePipeline.preview({ kind: "client", payload: { name: "Acme" } });
    expect(clientPreview.missingDependencies).toEqual(["client-manager"]);

    const projectPreview = await barePipeline.preview({
      kind: "project",
      payload: { name: "P", description: "D", projectPath: "/tmp/x", profileId: "profile-1" },
    });
    expect(projectPreview.missingDependencies).toEqual(["project"]);
  });

  it("lanza CREATION_INVALID_ID si falta el id al ejecutar la creación de una skill/regla/conocimiento", async () => {
    const skillPipeline = new CreationPipeline({
      skillManager: harness.skillManager,
      templateRegistry,
      promptRegistry,
      resolveProvider: (id) => providers.get(id),
    });
    await expect(
      skillPipeline.create({ kind: "skill", payload: { content: "x" } })
    ).rejects.toMatchObject({
      code: CreationErrorCode.CREATION_INVALID_ID,
    });

    const rulePipeline = new CreationPipeline({
      ruleManager: harness.ruleManager,
      templateRegistry,
      promptRegistry,
      resolveProvider: (id) => providers.get(id),
    });
    await expect(
      rulePipeline.create({ kind: "rule", payload: { content: "x" } })
    ).rejects.toMatchObject({
      code: CreationErrorCode.CREATION_INVALID_ID,
    });

    const knowledgePipeline = new CreationPipeline({
      knowledgeManager: harness.knowledgeManager,
      templateRegistry,
      promptRegistry,
      resolveProvider: (id) => providers.get(id),
    });
    await expect(
      knowledgePipeline.create({ kind: "knowledge", payload: { content: "x" } })
    ).rejects.toMatchObject({ code: CreationErrorCode.CREATION_INVALID_ID });
  });

  it("no detecta conflicto de id para skill/rule/knowledge cuando no se indica id", async () => {
    const preview = await pipeline.preview({ kind: "skill", payload: { content: "x" } });
    expect(preview.conflicts).toEqual([]);
    expect(preview.resolvedId).toBeUndefined();
  });

  it("informa de dependencia ausente si el manager de destino (agent) no está configurado", async () => {
    const bareRegistry = new CreationRegistry();
    const barePipeline = new CreationPipeline({
      templateRegistry: new CreationTemplateRegistry(),
      promptRegistry: new PromptRegistry(),
      resolveProvider: () => undefined,
      registry: bareRegistry,
    });
    const preview = await barePipeline.preview({ kind: "agent", payload: { id: "a1", data: {} } });
    expect(preview.missingDependencies).toEqual(["agent-manager"]);
  });

  it("lanza CREATION_DEPENDENCY_MISSING al intentar crear sin el manager configurado", async () => {
    const bareRegistry = new CreationRegistry();
    const barePipeline = new CreationPipeline({
      templateRegistry: new CreationTemplateRegistry(),
      promptRegistry: new PromptRegistry(),
      resolveProvider: () => undefined,
      registry: bareRegistry,
    });
    await expect(
      barePipeline.create({ kind: "agent", payload: { id: "a1", data: {} } })
    ).rejects.toMatchObject({ code: CreationErrorCode.CREATION_DEPENDENCY_MISSING });
  });

  // ---------------------------------------------------------------------
  // Modo simulación (dry-run)
  // ---------------------------------------------------------------------

  it("con dryRun no escribe nada y created es false", async () => {
    const result = await pipeline.create(
      { kind: "agent", payload: { id: "dry-agent", data: {} } },
      { dryRun: true }
    );
    expect(result.created).toBe(false);
    expect(result.dryRun).toBe(true);
    await expect(harness.agentManager.getAgent("dry-agent")).rejects.toThrow();
  });

  it("preview nunca escribe nada", async () => {
    await pipeline.preview({ kind: "agent", payload: { id: "preview-agent", data: {} } });
    await expect(harness.agentManager.getAgent("preview-agent")).rejects.toThrow();
  });

  // ---------------------------------------------------------------------
  // Cancelación
  // ---------------------------------------------------------------------

  it("cancel impide que una operación pendiente se ejecute", async () => {
    const preview = await pipeline.preview({ kind: "agent", payload: { id: "a1", data: {} } });
    expect(await pipeline.cancel(preview.operationId)).toBe(true);
    await expect(
      pipeline.create(
        { kind: "agent", payload: { id: "a1", data: {} } },
        { operationId: preview.operationId }
      )
    ).rejects.toMatchObject({ code: CreationErrorCode.CREATION_CANCELLED });
  });

  it("cancel devuelve false para una operación ya completada", async () => {
    const result = await pipeline.create({ kind: "agent", payload: { id: "a1", data: {} } });
    expect(await pipeline.cancel(result.operationId)).toBe(false);
  });

  it("cancel devuelve false para un operationId desconocido", async () => {
    expect(await pipeline.cancel("no-existe")).toBe(false);
  });

  it("no permite reutilizar un operationId ya completado", async () => {
    const result = await pipeline.create({ kind: "agent", payload: { id: "a1", data: {} } });
    await expect(
      pipeline.create(
        { kind: "agent", payload: { id: "a2", data: {} } },
        { operationId: result.operationId }
      )
    ).rejects.toMatchObject({ code: CreationErrorCode.CREATION_ALREADY_COMPLETED });
  });

  // ---------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------

  it("emite eventos durante todo el proceso de creación", async () => {
    const eventBus = new EventBus();
    const phases: string[] = [];
    eventBus.subscribe("creation.*", (envelope) => {
      phases.push(envelope.type);
    });
    const pipelineWithEvents = new CreationPipeline({
      agentManager: harness.agentManager,
      templateRegistry,
      promptRegistry,
      resolveProvider: (id) => providers.get(id),
      eventBus,
    });
    await pipelineWithEvents.create({ kind: "agent", payload: { id: "evt-agent", data: {} } });
    expect(phases).toContain("creation.started");
    expect(phases).toContain("creation.previewed");
    expect(phases).toContain("creation.completed");
  });

  it("emite creation.failed cuando la creación lanza", async () => {
    const eventBus = new EventBus();
    const phases: string[] = [];
    eventBus.subscribe("creation.*", (envelope) => {
      phases.push(envelope.type);
    });
    const pipelineWithEvents = new CreationPipeline({
      templateRegistry,
      promptRegistry,
      resolveProvider: (id) => providers.get(id),
      eventBus,
    });
    await expect(
      pipelineWithEvents.create({ kind: "agent", payload: { id: "a1", data: {} } })
    ).rejects.toThrow();
    expect(phases).toContain("creation.failed");
  });

  it("emite creation.cancelled al cancelar", async () => {
    const eventBus = new EventBus();
    const phases: string[] = [];
    eventBus.subscribe("creation.*", (envelope) => {
      phases.push(envelope.type);
    });
    const pipelineWithEvents = new CreationPipeline({
      agentManager: harness.agentManager,
      templateRegistry,
      promptRegistry,
      resolveProvider: (id) => providers.get(id),
      eventBus,
    });
    const preview = await pipelineWithEvents.preview({
      kind: "agent",
      payload: { id: "a1", data: {} },
    });
    await pipelineWithEvents.cancel(preview.operationId);
    expect(phases).toContain("creation.cancelled");
  });

  it("registra en el logger cada fase cuando hay un logger configurado", async () => {
    const logs: string[] = [];
    const logger = new Logger("ai-creator-manager-test", {
      minLevel: LogLevel.INFO,
      transports: [{ write: async (entry) => void logs.push(entry.message) }],
    });
    const pipelineWithLogger = new CreationPipeline({
      agentManager: harness.agentManager,
      templateRegistry,
      promptRegistry,
      resolveProvider: (id) => providers.get(id),
      logger,
    });
    await pipelineWithLogger.create({ kind: "agent", payload: { id: "logged-agent", data: {} } });
    expect(logs.some((m) => m.includes("creation:started"))).toBe(true);
    expect(logs.some((m) => m.includes("creation:completed"))).toBe(true);
  });

  it("registra un aviso si la verificación posterior falla y hay logger configurado", async () => {
    const logs: string[] = [];
    const logger = new Logger("ai-creator-manager-test", {
      minLevel: LogLevel.INFO,
      transports: [{ write: async (entry) => void logs.push(entry.message) }],
    });
    const fakeVerificationManager = {
      verify: async () => {
        throw new Error("verificación no disponible");
      },
    } as never;
    const pipelineWithVerification = new CreationPipeline({
      agentManager: harness.agentManager,
      templateRegistry,
      promptRegistry,
      resolveProvider: (id) => providers.get(id),
      logger,
      verificationManager: fakeVerificationManager,
    });
    const result = await pipelineWithVerification.create({
      kind: "agent",
      payload: { id: "verified-agent", data: {} },
    });
    expect(result.created).toBe(true);
    expect(logs.some((m) => m.includes("verificación posterior"))).toBe(true);
  });

  it("no falla la creación si no hay verificationManager configurado (afterExecution es un no-op)", async () => {
    const result = await pipeline.create({
      kind: "agent",
      payload: { id: "no-verify-agent", data: {} },
    });
    expect(result.created).toBe(true);
  });
});
