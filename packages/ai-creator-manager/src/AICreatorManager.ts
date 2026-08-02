import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import type { VerificationManager } from "@dwm/verification";
import type { StatusProvider } from "@dwm/status";
import { makeStatusReport } from "@dwm/status";
import type { AgentManager } from "@dwm/agent-manager";
import type { SkillManager } from "@dwm/skill-manager";
import type { RuleManager } from "@dwm/rule-manager";
import type { KnowledgeManager } from "@dwm/knowledge-manager";
import type { ClientManager } from "@dwm/client-manager";
import type { ProjectManager } from "@dwm/project";
import {
  type CreationRequest,
  type CreationOptions,
  type CreationKind,
  type StructureCreationRequest,
} from "./CreationTypes.js";
import type { CreationPreview } from "./CreationPreview.js";
import type { CreationResult, StructureCreationResult } from "./CreationResult.js";
import { CreationPipeline } from "./CreationPipeline.js";
import { CreationRegistry, type CreationOperationRecord } from "./CreationRegistry.js";
import { CreationValidator } from "./CreationValidator.js";
import { CreationTemplateRegistry, type CreationTemplateDefinition } from "./CreationTemplate.js";
import { PromptRegistry } from "./PromptRegistry.js";
import type { PromptTemplateDefinition } from "./PromptTemplate.js";
import type { AIProvider } from "./ProviderInterface.js";
import { NullAIProvider } from "./ProviderInterface.js";
import { CreationErrorCode } from "./errors/CreationErrorCode.js";
import { createCreationError } from "./errors/CreationError.js";

export interface AICreatorManagerOptions {
  readonly agentManager?: AgentManager;
  readonly skillManager?: SkillManager;
  readonly ruleManager?: RuleManager;
  readonly knowledgeManager?: KnowledgeManager;
  readonly clientManager?: ClientManager;
  readonly projectManager?: ProjectManager;
  readonly templateRegistry?: CreationTemplateRegistry;
  readonly promptRegistry?: PromptRegistry;
  readonly registry?: CreationRegistry;
  readonly validator?: CreationValidator;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly verificationManager?: VerificationManager;
}

/**
 * Módulo 30 — AI Creator Manager. Punto central de creación inteligente
 * de recursos del Workspace (agentes, skills, reglas, conocimiento,
 * clientes, proyectos y plantillas). Orquesta el proceso completo
 * —validación, resolución de contenido, detección de conflictos,
 * previsualización y ejecución final— reutilizando exclusivamente las
 * APIs públicas de `@dwm/agent-manager`, `@dwm/skill-manager`,
 * `@dwm/rule-manager`, `@dwm/knowledge-manager`, `@dwm/client-manager` y
 * `@dwm/project`. NO implementa ninguna llamada real a un proveedor de
 * IA (ni OpenAI, ni Claude, ni Gemini, ni Ollama, ni DeepSeek): la
 * arquitectura queda preparada para conectar proveedores intercambiables
 * mediante `ProviderInterface`, pero mientras no se registre ninguno,
 * toda creación se resuelve de forma manual o por plantilla. Implementa
 * `IModule`.
 */
export class AICreatorManager implements IModule {
  readonly id = "ai-creator-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly pipeline: CreationPipeline;
  private readonly registry: CreationRegistry;
  private readonly validator: CreationValidator;
  private readonly templateRegistry: CreationTemplateRegistry;
  private readonly promptRegistry: PromptRegistry;
  private readonly providers = new Map<string, AIProvider>();

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;
  private readonly verificationManager?: VerificationManager;
  private readonly agentManager?: AgentManager;
  private readonly skillManager?: SkillManager;
  private readonly ruleManager?: RuleManager;
  private readonly knowledgeManager?: KnowledgeManager;
  private readonly clientManager?: ClientManager;
  private readonly projectManager?: ProjectManager;

  constructor(options: AICreatorManagerOptions = {}) {
    if (options.agentManager) this.agentManager = options.agentManager;
    if (options.skillManager) this.skillManager = options.skillManager;
    if (options.ruleManager) this.ruleManager = options.ruleManager;
    if (options.knowledgeManager) this.knowledgeManager = options.knowledgeManager;
    if (options.clientManager) this.clientManager = options.clientManager;
    if (options.projectManager) this.projectManager = options.projectManager;
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
    if (options.verificationManager) this.verificationManager = options.verificationManager;

    this.registry = options.registry ?? new CreationRegistry();
    this.validator = options.validator ?? new CreationValidator();
    this.templateRegistry = options.templateRegistry ?? new CreationTemplateRegistry();
    this.promptRegistry = options.promptRegistry ?? new PromptRegistry();

    const defaultProvider = new NullAIProvider();
    this.providers.set(defaultProvider.id, defaultProvider);

    this.pipeline = new CreationPipeline({
      ...(this.agentManager ? { agentManager: this.agentManager } : {}),
      ...(this.skillManager ? { skillManager: this.skillManager } : {}),
      ...(this.ruleManager ? { ruleManager: this.ruleManager } : {}),
      ...(this.knowledgeManager ? { knowledgeManager: this.knowledgeManager } : {}),
      ...(this.clientManager ? { clientManager: this.clientManager } : {}),
      ...(this.projectManager ? { projectManager: this.projectManager } : {}),
      templateRegistry: this.templateRegistry,
      promptRegistry: this.promptRegistry,
      resolveProvider: (id: string) => this.providers.get(id),
      registry: this.registry,
      validator: this.validator,
      ...(this.logger ? { logger: this.logger } : {}),
      ...(this.eventBus ? { eventBus: this.eventBus } : {}),
      ...(this.verificationManager ? { verificationManager: this.verificationManager } : {}),
    });
  }

  // ---------------------------------------------------------------------
  // Creación — API pública principal
  // ---------------------------------------------------------------------

  /** Genera una previsualización completa sin escribir nada en disco. */
  async previewCreation(
    request: CreationRequest,
    options: CreationOptions = {}
  ): Promise<CreationPreview> {
    return this.pipeline.preview(request, options);
  }

  /** Crea un recurso. Con `options.dryRun`, se comporta exactamente como `previewCreation` pero devuelve un `CreationResult`. */
  async create(request: CreationRequest, options: CreationOptions = {}): Promise<CreationResult> {
    return this.pipeline.create(request, options);
  }

  async createAgent(
    payload: Extract<CreationRequest, { kind: "agent" }>["payload"],
    options?: CreationOptions
  ): Promise<CreationResult> {
    return this.create({ kind: "agent", payload }, options);
  }

  async createSkill(
    payload: Extract<CreationRequest, { kind: "skill" }>["payload"],
    options?: CreationOptions
  ): Promise<CreationResult> {
    return this.create({ kind: "skill", payload }, options);
  }

  async createRule(
    payload: Extract<CreationRequest, { kind: "rule" }>["payload"],
    options?: CreationOptions
  ): Promise<CreationResult> {
    return this.create({ kind: "rule", payload }, options);
  }

  async createKnowledge(
    payload: Extract<CreationRequest, { kind: "knowledge" }>["payload"],
    options?: CreationOptions
  ): Promise<CreationResult> {
    return this.create({ kind: "knowledge", payload }, options);
  }

  async createClient(
    payload: Extract<CreationRequest, { kind: "client" }>["payload"],
    options?: CreationOptions
  ): Promise<CreationResult> {
    return this.create({ kind: "client", payload }, options);
  }

  async createProject(
    payload: Extract<CreationRequest, { kind: "project" }>["payload"],
    options?: CreationOptions
  ): Promise<CreationResult> {
    return this.create({ kind: "project", payload }, options);
  }

  async createTemplate(
    payload: Extract<CreationRequest, { kind: "template" }>["payload"],
    options?: CreationOptions
  ): Promise<CreationResult> {
    return this.create({ kind: "template", payload }, options);
  }

  /**
   * Crea una estructura completa: varios recursos relacionados, en el
   * orden indicado. Se detiene en el primer fallo (sin revertir lo ya
   * creado: cada recurso ya escrito por un manager de destino queda tal
   * cual, de la misma forma que si se hubiera llamado a `create()` para
   * cada uno por separado). Con `options.dryRun`, ningún elemento
   * escribe nada, igual que en `create()`.
   */
  async createStructure(
    request: StructureCreationRequest,
    options: CreationOptions = {}
  ): Promise<StructureCreationResult> {
    const operationId =
      options.operationId ?? `structure-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const results: CreationResult[] = [];
    for (let index = 0; index < request.items.length; index += 1) {
      const item = request.items[index];
      if (!item) continue;
      try {
        const result = await this.create(item, {
          ...options,
          operationId: `${operationId}-${index}`,
        });
        results.push(result);
      } catch (err) {
        return {
          operationId,
          dryRun: options.dryRun ?? false,
          results,
          failedAt: index,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    return { operationId, dryRun: options.dryRun ?? false, results };
  }

  // ---------------------------------------------------------------------
  // Cancelación y consulta de operaciones
  // ---------------------------------------------------------------------

  /** Cancela una operación de creación todavía no finalizada. Verdadero si la cancelación tuvo efecto. */
  async cancel(operationId: string): Promise<boolean> {
    return this.pipeline.cancel(operationId);
  }

  getOperation(operationId: string): CreationOperationRecord | undefined {
    return this.registry.get(operationId);
  }

  listOperations(): CreationOperationRecord[] {
    return this.registry.list();
  }

  // ---------------------------------------------------------------------
  // Plantillas de creación
  // ---------------------------------------------------------------------

  registerTemplate(definition: CreationTemplateDefinition): void {
    this.templateRegistry.register(definition);
  }

  getTemplate(id: string): CreationTemplateDefinition | undefined {
    return this.templateRegistry.get(id);
  }

  listTemplates(targetKind?: CreationKind): CreationTemplateDefinition[] {
    return this.templateRegistry.list(targetKind);
  }

  removeTemplate(id: string): void {
    this.templateRegistry.remove(id);
  }

  // ---------------------------------------------------------------------
  // Prompts (para proveedores de IA futuros)
  // ---------------------------------------------------------------------

  registerPrompt(definition: PromptTemplateDefinition): void {
    this.promptRegistry.register(definition);
  }

  getPrompt(id: string): PromptTemplateDefinition | undefined {
    return this.promptRegistry.get(id);
  }

  listPrompts(kind?: CreationKind): PromptTemplateDefinition[] {
    return this.promptRegistry.list(kind);
  }

  removePrompt(id: string): void {
    this.promptRegistry.remove(id);
  }

  // ---------------------------------------------------------------------
  // Proveedores de IA (intercambiables, ninguno implementado todavía)
  // ---------------------------------------------------------------------

  /** Registra un proveedor de IA intercambiable. No hace ninguna llamada real: solo lo deja disponible para usarse desde `promptId`/`providerId`. */
  registerProvider(provider: AIProvider): void {
    if (this.providers.has(provider.id)) {
      throw createCreationError({
        code: CreationErrorCode.CREATION_PROVIDER_ALREADY_REGISTERED,
        message: `Ya hay un proveedor de IA registrado con id "${provider.id}".`,
        origin: "provider",
        recoverable: true,
      });
    }
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  listProviders(): string[] {
    return [...this.providers.keys()].sort();
  }

  removeProvider(id: string): void {
    if (id === "null") return; // el proveedor por defecto nunca se retira.
    this.providers.delete(id);
  }

  // ---------------------------------------------------------------------
  // Integraciones y estado
  // ---------------------------------------------------------------------

  listConnectedIntegrations(): string[] {
    const connected: string[] = [];
    if (this.agentManager) connected.push("agent-manager");
    if (this.skillManager) connected.push("skill-manager");
    if (this.ruleManager) connected.push("rule-manager");
    if (this.knowledgeManager) connected.push("knowledge-manager");
    if (this.clientManager) connected.push("client-manager");
    if (this.projectManager) connected.push("project");
    if (this.configManager) connected.push("config");
    if (this.verificationManager) connected.push("verification");
    return connected;
  }

  toStatusProvider(): StatusProvider {
    return {
      id: "ai-creator-manager",
      getStatus: () =>
        makeStatusReport("ai-creator-manager", "OK", "ai-creator-manager responde correctamente.", {
          integrations: this.listConnectedIntegrations(),
          templates: this.templateRegistry.list().length,
          prompts: this.promptRegistry.list().length,
          providers: this.listProviders(),
          operations: this.registry.list().length,
        }),
    };
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("ai-creator-manager", {
        integrations: this.listConnectedIntegrations(),
        providers: this.listProviders(),
      });
    }

    context.reportStatus(SystemStatus.OK, "ai-creator-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }
}
