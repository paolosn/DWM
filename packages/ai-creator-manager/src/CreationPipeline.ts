import { randomUUID } from "node:crypto";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { VerificationManager } from "@dwm/verification";
import type { AgentManager } from "@dwm/agent-manager";
import type { SkillManager } from "@dwm/skill-manager";
import type { RuleManager } from "@dwm/rule-manager";
import type { KnowledgeManager } from "@dwm/knowledge-manager";
import { ClientManager, isClientStatus } from "@dwm/client-manager";
import type { ProjectManager, ProjectConfiguration } from "@dwm/project";
import {
  type CreationRequest,
  type CreationOptions,
  type CreationConflict,
  type CreationWarning,
  type CreationMetadata,
  type GeneratedContentPayload,
} from "./CreationTypes.js";
import {
  CreationPreviewBuilder,
  type CreationPreview,
  isPreviewExecutable,
} from "./CreationPreview.js";
import type { CreationResult } from "./CreationResult.js";
import { CreationRegistry } from "./CreationRegistry.js";
import { CreationValidator } from "./CreationValidator.js";
import {
  CreationTemplateRegistry,
  renderCreationTemplate,
  type CreationTemplateDefinition,
} from "./CreationTemplate.js";
import { PromptRegistry } from "./PromptRegistry.js";
import { renderPromptTemplate } from "./PromptTemplate.js";
import type { AIProvider } from "./ProviderInterface.js";
import { CreationErrorCode } from "./errors/CreationErrorCode.js";
import { createCreationError, isNotFoundError } from "./errors/CreationError.js";

export interface CreationPipelineOptions {
  readonly agentManager?: AgentManager;
  readonly skillManager?: SkillManager;
  readonly ruleManager?: RuleManager;
  readonly knowledgeManager?: KnowledgeManager;
  readonly clientManager?: ClientManager;
  readonly projectManager?: ProjectManager;
  readonly templateRegistry: CreationTemplateRegistry;
  readonly promptRegistry: PromptRegistry;
  readonly resolveProvider: (id: string) => AIProvider | undefined;
  readonly registry?: CreationRegistry;
  readonly validator?: CreationValidator;
  readonly previewBuilder?: CreationPreviewBuilder;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly verificationManager?: VerificationManager;
}

interface ResolvedCreation {
  readonly resolvedId?: string;
  readonly resolvedPayload: unknown;
  readonly metadata: CreationMetadata;
  readonly dependencies: readonly string[];
  readonly missingDependencies: readonly string[];
  readonly conflicts: readonly CreationConflict[];
  readonly warnings: readonly CreationWarning[];
  readonly execute: (root?: string) => Promise<unknown>;
}

function now(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function managerNotConfigured(managerName: string): never {
  throw createCreationError({
    code: CreationErrorCode.CREATION_MANAGER_NOT_CONFIGURED,
    message: `"${managerName}" no está configurado en AICreatorManager: no se puede completar esta creación.`,
    origin: "dependency",
    recoverable: true,
  });
}

/**
 * Orquesta el ciclo de vida completo de una creación: valida la
 * petición, resuelve su contenido (manual, por plantilla, o —en el
 * futuro— por un proveedor de IA todavía no implementado), detecta
 * conflictos y dependencias ausentes, construye una previsualización
 * completa y, solo si se aprueba explícitamente y no está en modo
 * simulación, delega la escritura final en el manager público
 * correspondiente. Nunca toca el sistema de ficheros por sí misma.
 */
export class CreationPipeline {
  private readonly agentManager?: AgentManager;
  private readonly skillManager?: SkillManager;
  private readonly ruleManager?: RuleManager;
  private readonly knowledgeManager?: KnowledgeManager;
  private readonly clientManager?: ClientManager;
  private readonly projectManager?: ProjectManager;
  private readonly templateRegistry: CreationTemplateRegistry;
  private readonly promptRegistry: PromptRegistry;
  private readonly resolveProvider: (id: string) => AIProvider | undefined;
  private readonly registry: CreationRegistry;
  private readonly validator: CreationValidator;
  private readonly previewBuilder: CreationPreviewBuilder;
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly verificationManager?: VerificationManager;

  constructor(options: CreationPipelineOptions) {
    if (options.agentManager) this.agentManager = options.agentManager;
    if (options.skillManager) this.skillManager = options.skillManager;
    if (options.ruleManager) this.ruleManager = options.ruleManager;
    if (options.knowledgeManager) this.knowledgeManager = options.knowledgeManager;
    if (options.clientManager) this.clientManager = options.clientManager;
    if (options.projectManager) this.projectManager = options.projectManager;
    this.templateRegistry = options.templateRegistry;
    this.promptRegistry = options.promptRegistry;
    this.resolveProvider = options.resolveProvider;
    this.registry = options.registry ?? new CreationRegistry();
    this.validator = options.validator ?? new CreationValidator();
    this.previewBuilder = options.previewBuilder ?? new CreationPreviewBuilder();
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.verificationManager) this.verificationManager = options.verificationManager;
  }

  getRegistry(): CreationRegistry {
    return this.registry;
  }

  async preview(request: CreationRequest, options: CreationOptions = {}): Promise<CreationPreview> {
    this.validator.assertValidRequest(request);
    const operationId = await this.beginOperation(request, options);
    try {
      const { preview } = await this.resolveAndBuildPreview(request, options, operationId);
      this.registry.transition(operationId, "previewed");
      await this.notify("previewed", operationId, request.kind, { preview });
      return preview;
    } catch (err) {
      this.registry.transition(operationId, "failed", errorMessage(err));
      await this.notify("failed", operationId, request.kind, { error: errorMessage(err) });
      throw err;
    }
  }

  async create(request: CreationRequest, options: CreationOptions = {}): Promise<CreationResult> {
    this.validator.assertValidRequest(request);
    const operationId = await this.beginOperation(request, options);
    try {
      let attemptRequest = request;
      let resolved: ResolvedCreation | undefined;
      let preview: CreationPreview | undefined;
      const maxAttempts = options.allowAlternativeId ? 6 : 1;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const outcome = await this.resolveAndBuildPreview(attemptRequest, options, operationId);
        resolved = outcome.resolved;
        preview = outcome.preview;

        const idConflict = preview.conflicts.find((c) => c.field === "id" || c.field === "slug");
        const alternative = idConflict?.suggestions?.[0];
        if (idConflict && options.allowAlternativeId && alternative && attempt < maxAttempts) {
          attemptRequest = this.withAlternativeId(attemptRequest, idConflict.field, alternative);
          continue;
        }
        break;
      }
      if (!resolved || !preview) {
        // Inalcanzable: el bucle siempre ejecuta al menos una iteración.
        throw createCreationError({
          code: CreationErrorCode.CREATION_EXECUTION_FAILED,
          message: "No se pudo resolver la creación.",
          origin: "pipeline",
          recoverable: false,
        });
      }

      this.registry.transition(operationId, "previewed");
      await this.notify("previewed", operationId, request.kind, { preview });

      if (options.dryRun) {
        const result: CreationResult = {
          operationId,
          kind: request.kind,
          ...(preview.resolvedId !== undefined ? { id: preview.resolvedId } : {}),
          dryRun: true,
          created: false,
          preview,
        };
        this.registry.transition(operationId, "completed");
        await this.notify("completed", operationId, request.kind, { result });
        return result;
      }

      if (this.registry.isCancelled(operationId)) {
        throw createCreationError({
          code: CreationErrorCode.CREATION_CANCELLED,
          message: `La operación "${operationId}" se canceló antes de ejecutarse.`,
          origin: "cancellation",
          recoverable: true,
        });
      }
      if (preview.missingDependencies.length > 0) {
        throw createCreationError({
          code: CreationErrorCode.CREATION_DEPENDENCY_MISSING,
          message: `Faltan dependencias para crear "${request.kind}": ${preview.missingDependencies.join(", ")}.`,
          origin: "dependency",
          recoverable: true,
        });
      }
      if (!isPreviewExecutable(preview)) {
        throw createCreationError({
          code: CreationErrorCode.CREATION_CONFLICT,
          message: `Conflicto al crear "${request.kind}": ${preview.conflicts.map((c) => c.message).join("; ")}`,
          origin: "conflict",
          recoverable: true,
        });
      }

      this.registry.transition(operationId, "executing");
      if (this.registry.isCancelled(operationId)) {
        throw createCreationError({
          code: CreationErrorCode.CREATION_CANCELLED,
          message: `La operación "${operationId}" se canceló durante la ejecución.`,
          origin: "cancellation",
          recoverable: true,
        });
      }

      const data = await resolved.execute(options.root);
      const result: CreationResult = {
        operationId,
        kind: request.kind,
        ...(preview.resolvedId !== undefined ? { id: preview.resolvedId } : {}),
        dryRun: false,
        created: true,
        data,
        preview,
      };
      this.registry.transition(operationId, "completed");
      await this.notify("completed", operationId, request.kind, { id: preview.resolvedId });
      await this.afterExecution();
      return result;
    } catch (err) {
      this.registry.transition(operationId, "failed", errorMessage(err));
      await this.notify("failed", operationId, request.kind, { error: errorMessage(err) });
      throw err;
    }
  }

  async cancel(operationId: string): Promise<boolean> {
    const cancelled = this.registry.cancel(operationId);
    if (cancelled) {
      const record = this.registry.get(operationId);
      await this.notify("cancelled", operationId, record?.kind ?? "agent", {});
    }
    return cancelled;
  }

  // ---------------------------------------------------------------------
  // Internos — ciclo de la operación
  // ---------------------------------------------------------------------

  private async beginOperation(
    request: CreationRequest,
    options: CreationOptions
  ): Promise<string> {
    const operationId = options.operationId ?? randomUUID();
    const existing = this.registry.get(operationId);
    if (existing) {
      if (this.registry.isTerminal(operationId)) {
        throw createCreationError({
          code:
            existing.state === "cancelled"
              ? CreationErrorCode.CREATION_CANCELLED
              : CreationErrorCode.CREATION_ALREADY_COMPLETED,
          message: `La operación "${operationId}" ya finalizó (estado "${existing.state}") y no puede reutilizarse.`,
          origin: "registry",
          recoverable: true,
        });
      }
    } else {
      this.registry.register(operationId, request.kind);
    }
    this.registry.transition(operationId, "validating");
    await this.notify("started", operationId, request.kind, {});
    return operationId;
  }

  private async resolveAndBuildPreview(
    request: CreationRequest,
    options: CreationOptions,
    operationId: string
  ): Promise<{ resolved: ResolvedCreation; preview: CreationPreview }> {
    this.registry.transition(operationId, "resolving");
    const resolved = await this.resolveByKind(request, options);
    const preview = this.previewBuilder.build({
      operationId,
      kind: request.kind,
      ...(resolved.resolvedId !== undefined ? { resolvedId: resolved.resolvedId } : {}),
      resolvedPayload: resolved.resolvedPayload,
      metadata: resolved.metadata,
      dependencies: resolved.dependencies,
      missingDependencies: resolved.missingDependencies,
      conflicts: resolved.conflicts,
      warnings: resolved.warnings,
    });
    return { resolved, preview };
  }

  private withAlternativeId(
    request: CreationRequest,
    field: string,
    alternative: string
  ): CreationRequest {
    switch (request.kind) {
      case "agent":
        return { kind: "agent", payload: { ...request.payload, id: alternative } };
      case "skill":
        return { kind: "skill", payload: { ...request.payload, id: alternative } };
      case "rule":
        return { kind: "rule", payload: { ...request.payload, id: alternative } };
      case "knowledge":
        return { kind: "knowledge", payload: { ...request.payload, id: alternative } };
      case "client":
        return field === "slug"
          ? { kind: "client", payload: { ...request.payload, slug: alternative } }
          : { kind: "client", payload: { ...request.payload, id: alternative } };
      case "template":
        return { kind: "template", payload: { ...request.payload, id: alternative } };
      case "project":
        return request;
    }
  }

  private async resolveByKind(
    request: CreationRequest,
    options: CreationOptions
  ): Promise<ResolvedCreation> {
    switch (request.kind) {
      case "agent":
        return this.resolveAgent(request.payload, options);
      case "skill":
        return this.resolveSkill(request.payload, options);
      case "rule":
        return this.resolveRule(request.payload, options);
      case "knowledge":
        return this.resolveKnowledge(request.payload, options);
      case "client":
        return this.resolveClient(request.payload, options);
      case "project":
        return this.resolveProject(request.payload);
      case "template":
        return this.resolveTemplate(request.payload);
    }
  }

  // ---------------------------------------------------------------------
  // Resolución de contenido (manual / plantilla / proveedor de IA)
  // ---------------------------------------------------------------------

  private async resolveTextContent(
    kind: "skill" | "rule" | "knowledge",
    manualContent: string | undefined,
    payload: GeneratedContentPayload
  ): Promise<{ content: string; metadata: CreationMetadata; warnings: CreationWarning[] }> {
    const warnings: CreationWarning[] = [];
    const sourceCount = [
      manualContent !== undefined,
      payload.templateId !== undefined,
      payload.promptId !== undefined,
    ].filter(Boolean).length;
    if (sourceCount > 1) {
      throw createCreationError({
        code: CreationErrorCode.CREATION_INVALID_REQUEST,
        message: `Solo se admite una fuente de contenido (manual, templateId o promptId) para "${kind}".`,
        origin: "request",
        recoverable: true,
      });
    }

    if (manualContent !== undefined) {
      return {
        content: manualContent,
        metadata: { source: "manual", generatedAt: now() },
        warnings,
      };
    }
    if (payload.templateId !== undefined) {
      const definition = this.templateRegistry.require(payload.templateId);
      if (definition.targetKind !== kind) {
        warnings.push({
          field: "templateId",
          message: `la plantilla "${payload.templateId}" está pensada para "${definition.targetKind}", no para "${kind}".`,
        });
      }
      const rendered = renderCreationTemplate(definition, payload.variables ?? {});
      if (rendered.content === undefined) {
        throw createCreationError({
          code: CreationErrorCode.CREATION_VALIDATION_FAILED,
          message: `La plantilla "${payload.templateId}" no define contenido de texto, necesario para "${kind}".`,
          origin: "template",
          recoverable: true,
        });
      }
      return {
        content: rendered.content,
        metadata: { source: "template", templateId: definition.id, generatedAt: now() },
        warnings,
      };
    }
    if (payload.promptId !== undefined) {
      const promptDefinition = this.promptRegistry.require(payload.promptId);
      const providerId = payload.providerId ?? "null";
      const provider = this.resolveProvider(providerId);
      if (!provider) {
        throw createCreationError({
          code: CreationErrorCode.CREATION_PROVIDER_NOT_FOUND,
          message: `No hay ningún proveedor de IA registrado con id "${providerId}".`,
          origin: "provider",
          recoverable: true,
        });
      }
      const prompt = renderPromptTemplate(promptDefinition, payload.variables ?? {});
      const generated = await provider.generate({
        kind,
        prompt,
        ...(payload.variables !== undefined ? { variables: payload.variables } : {}),
      });
      return {
        content: generated.content,
        metadata: {
          source: "provider",
          promptId: promptDefinition.id,
          providerId: provider.id,
          generatedAt: now(),
        },
        warnings,
      };
    }
    throw createCreationError({
      code: CreationErrorCode.CREATION_INVALID_REQUEST,
      message: `Hay que indicar content, templateId o promptId para crear "${kind}".`,
      origin: "request",
      recoverable: true,
    });
  }

  private async resolveDataObject(
    manualData: Record<string, unknown> | undefined,
    payload: GeneratedContentPayload
  ): Promise<{
    data: Record<string, unknown>;
    metadata: CreationMetadata;
    warnings: CreationWarning[];
  }> {
    const warnings: CreationWarning[] = [];
    const sourceCount = [
      manualData !== undefined,
      payload.templateId !== undefined,
      payload.promptId !== undefined,
    ].filter(Boolean).length;
    if (sourceCount > 1) {
      throw createCreationError({
        code: CreationErrorCode.CREATION_INVALID_REQUEST,
        message: 'Solo se admite una fuente de datos (manual, templateId o promptId) para "agent".',
        origin: "request",
        recoverable: true,
      });
    }

    if (manualData !== undefined) {
      return { data: manualData, metadata: { source: "manual", generatedAt: now() }, warnings };
    }
    if (payload.templateId !== undefined) {
      const definition = this.templateRegistry.require(payload.templateId);
      if (definition.targetKind !== "agent") {
        warnings.push({
          field: "templateId",
          message: `la plantilla "${payload.templateId}" está pensada para "${definition.targetKind}", no para "agent".`,
        });
      }
      const rendered = renderCreationTemplate(definition, payload.variables ?? {});
      if (rendered.data === undefined) {
        throw createCreationError({
          code: CreationErrorCode.CREATION_VALIDATION_FAILED,
          message: `La plantilla "${payload.templateId}" no define datos estructurados, necesarios para "agent".`,
          origin: "template",
          recoverable: true,
        });
      }
      return {
        data: rendered.data,
        metadata: { source: "template", templateId: definition.id, generatedAt: now() },
        warnings,
      };
    }
    if (payload.promptId !== undefined) {
      const promptDefinition = this.promptRegistry.require(payload.promptId);
      const providerId = payload.providerId ?? "null";
      const provider = this.resolveProvider(providerId);
      if (!provider) {
        throw createCreationError({
          code: CreationErrorCode.CREATION_PROVIDER_NOT_FOUND,
          message: `No hay ningún proveedor de IA registrado con id "${providerId}".`,
          origin: "provider",
          recoverable: true,
        });
      }
      const prompt = renderPromptTemplate(promptDefinition, payload.variables ?? {});
      const generated = await provider.generate({
        kind: "agent",
        prompt,
        ...(payload.variables !== undefined ? { variables: payload.variables } : {}),
      });
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(generated.content) as Record<string, unknown>;
      } catch (err) {
        throw createCreationError({
          code: CreationErrorCode.CREATION_VALIDATION_FAILED,
          message: `El proveedor "${provider.id}" no devolvió JSON válido para los datos del agente.`,
          origin: "provider",
          recoverable: true,
          cause: err,
        });
      }
      return {
        data,
        metadata: {
          source: "provider",
          promptId: promptDefinition.id,
          providerId: provider.id,
          generatedAt: now(),
        },
        warnings,
      };
    }
    throw createCreationError({
      code: CreationErrorCode.CREATION_INVALID_REQUEST,
      message: 'Hay que indicar data, templateId o promptId para crear "agent".',
      origin: "request",
      recoverable: true,
    });
  }

  // ---------------------------------------------------------------------
  // Resolución por tipo de recurso
  // ---------------------------------------------------------------------

  private async checkExists(fetch: () => Promise<unknown>): Promise<boolean> {
    try {
      await fetch();
      return true;
    } catch (err) {
      if (isNotFoundError(err)) return false;
      throw err;
    }
  }

  private async resolveAgent(
    payload: import("./CreationTypes.js").AgentCreationPayload,
    options: CreationOptions
  ): Promise<ResolvedCreation> {
    const { data, metadata, warnings } = await this.resolveDataObject(payload.data, payload);
    const missingDependencies = this.agentManager ? [] : ["agent-manager"];
    const conflicts: CreationConflict[] = [];
    const resolvedId = payload.id;
    if (resolvedId !== undefined && this.agentManager) {
      const exists = await this.checkExists(() =>
        this.agentManager!.getAgent(resolvedId, options.root)
      );
      if (exists) {
        conflicts.push({
          field: "id",
          message: `ya existe un agente con id "${resolvedId}".`,
          suggestions: this.validator.suggestAlternativeIds(resolvedId),
        });
      }
    }
    return {
      ...(resolvedId !== undefined ? { resolvedId } : {}),
      resolvedPayload: data,
      metadata,
      dependencies: ["agent-manager"],
      missingDependencies,
      conflicts,
      warnings,
      execute: async (root) => {
        if (!this.agentManager) managerNotConfigured("agent-manager");
        if (resolvedId === undefined) {
          throw createCreationError({
            code: CreationErrorCode.CREATION_INVALID_ID,
            message: "un agente necesita un id para poder crearse.",
            origin: "id",
            recoverable: true,
          });
        }
        return this.agentManager.createAgent({ id: resolvedId, data }, root);
      },
    };
  }

  private async resolveSkill(
    payload: import("./CreationTypes.js").SkillCreationPayload,
    options: CreationOptions
  ): Promise<ResolvedCreation> {
    const { content, metadata, warnings } = await this.resolveTextContent(
      "skill",
      payload.content,
      payload
    );
    const missingDependencies = this.skillManager ? [] : ["skill-manager"];
    const conflicts: CreationConflict[] = [];
    const resolvedId = payload.id;
    if (resolvedId !== undefined && this.skillManager) {
      const exists = await this.checkExists(() =>
        this.skillManager!.getSkill(resolvedId, options.root)
      );
      if (exists) {
        conflicts.push({
          field: "id",
          message: `ya existe una skill con id "${resolvedId}".`,
          suggestions: this.validator.suggestAlternativeIds(resolvedId),
        });
      }
    }
    return {
      ...(resolvedId !== undefined ? { resolvedId } : {}),
      resolvedPayload: content,
      metadata,
      dependencies: ["skill-manager"],
      missingDependencies,
      conflicts,
      warnings,
      execute: async (root) => {
        if (!this.skillManager) managerNotConfigured("skill-manager");
        if (resolvedId === undefined) {
          throw createCreationError({
            code: CreationErrorCode.CREATION_INVALID_ID,
            message: "una skill necesita un id para poder crearse.",
            origin: "id",
            recoverable: true,
          });
        }
        return this.skillManager.createSkill({ id: resolvedId, content }, root);
      },
    };
  }

  private async resolveRule(
    payload: import("./CreationTypes.js").RuleCreationPayload,
    options: CreationOptions
  ): Promise<ResolvedCreation> {
    const { content, metadata, warnings } = await this.resolveTextContent(
      "rule",
      payload.content,
      payload
    );
    const missingDependencies = this.ruleManager ? [] : ["rule-manager"];
    const conflicts: CreationConflict[] = [];
    const resolvedId = payload.id;
    if (resolvedId !== undefined && this.ruleManager) {
      const exists = await this.checkExists(() =>
        this.ruleManager!.getRule(resolvedId, options.root)
      );
      if (exists) {
        conflicts.push({
          field: "id",
          message: `ya existe una regla con id "${resolvedId}".`,
          suggestions: this.validator.suggestAlternativeIds(resolvedId),
        });
      }
    }
    return {
      ...(resolvedId !== undefined ? { resolvedId } : {}),
      resolvedPayload: content,
      metadata,
      dependencies: ["rule-manager"],
      missingDependencies,
      conflicts,
      warnings,
      execute: async (root) => {
        if (!this.ruleManager) managerNotConfigured("rule-manager");
        if (resolvedId === undefined) {
          throw createCreationError({
            code: CreationErrorCode.CREATION_INVALID_ID,
            message: "una regla necesita un id para poder crearse.",
            origin: "id",
            recoverable: true,
          });
        }
        return this.ruleManager.createRule({ id: resolvedId, content }, root);
      },
    };
  }

  private async resolveKnowledge(
    payload: import("./CreationTypes.js").KnowledgeCreationPayload,
    options: CreationOptions
  ): Promise<ResolvedCreation> {
    const { content, metadata, warnings } = await this.resolveTextContent(
      "knowledge",
      payload.content,
      payload
    );
    const missingDependencies = this.knowledgeManager ? [] : ["knowledge-manager"];
    const conflicts: CreationConflict[] = [];
    const resolvedId = payload.id;
    if (resolvedId !== undefined && this.knowledgeManager) {
      const exists = await this.checkExists(() =>
        this.knowledgeManager!.getKnowledge(resolvedId, options.root)
      );
      if (exists) {
        conflicts.push({
          field: "id",
          message: `ya existe un elemento de conocimiento con id "${resolvedId}".`,
          suggestions: this.validator.suggestAlternativeIds(resolvedId),
        });
      }
    }
    return {
      ...(resolvedId !== undefined ? { resolvedId } : {}),
      resolvedPayload: content,
      metadata,
      dependencies: ["knowledge-manager"],
      missingDependencies,
      conflicts,
      warnings,
      execute: async (root) => {
        if (!this.knowledgeManager) managerNotConfigured("knowledge-manager");
        if (resolvedId === undefined) {
          throw createCreationError({
            code: CreationErrorCode.CREATION_INVALID_ID,
            message: "un elemento de conocimiento necesita un id para poder crearse.",
            origin: "id",
            recoverable: true,
          });
        }
        return this.knowledgeManager.createKnowledge(
          {
            id: resolvedId,
            content,
            ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
            ...(payload.category !== undefined ? { category: payload.category } : {}),
          },
          root
        );
      },
    };
  }

  private async resolveClient(
    payload: import("./CreationTypes.js").ClientCreationPayload,
    options: CreationOptions
  ): Promise<ResolvedCreation> {
    const warnings: CreationWarning[] = [];
    const conflicts: CreationConflict[] = [];
    const missingDependencies = this.clientManager ? [] : ["client-manager"];
    const slug = payload.slug ?? slugify(payload.name);
    const id = payload.id ?? slug;

    let status: string | undefined;
    if (payload.status !== undefined) {
      if (isClientStatus(payload.status)) {
        status = payload.status;
      } else {
        warnings.push({
          field: "status",
          message: `"${payload.status}" no es un estado de cliente reconocido: se ignora.`,
        });
      }
    }

    if (this.clientManager) {
      const idExists = await this.checkExists(() =>
        this.clientManager!.getClient(id, options.root)
      );
      if (idExists) {
        conflicts.push({
          field: "id",
          message: `ya existe un cliente con id "${id}".`,
          suggestions: this.validator.suggestAlternativeIds(id),
        });
      }
      const clients = await this.clientManager.listClients({
        includeArchived: true,
        ...(options.root !== undefined ? { root: options.root } : {}),
      });
      const slugTaken = clients.some(
        (client) => client.id !== id && client.slug.toLowerCase() === slug.toLowerCase()
      );
      if (slugTaken) {
        conflicts.push({
          field: "slug",
          message: `ya existe un cliente con slug "${slug}".`,
          suggestions: this.validator.suggestAlternativeIds(slug),
        });
      }
    }

    const resolvedPayload = {
      id,
      slug,
      name: payload.name,
      ...(status !== undefined ? { status } : {}),
      ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
    };

    return {
      resolvedId: id,
      resolvedPayload,
      metadata: { source: "manual", generatedAt: now() },
      dependencies: ["client-manager"],
      missingDependencies,
      conflicts,
      warnings,
      execute: async (root) => {
        if (!this.clientManager) managerNotConfigured("client-manager");
        return this.clientManager.createClient(
          {
            id,
            slug,
            name: payload.name,
            ...(status !== undefined ? { status: status as never } : {}),
            ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
            ...(payload.description !== undefined ? { description: payload.description } : {}),
          },
          root
        );
      },
    };
  }

  private resolveProject(
    payload: import("./CreationTypes.js").ProjectCreationPayload
  ): Promise<ResolvedCreation> {
    const missingDependencies = this.projectManager ? [] : ["project"];
    const configuration: ProjectConfiguration = {
      projectPath: payload.projectPath,
      profileId: payload.profileId,
      ...(payload.workspaceId !== undefined ? { workspaceId: payload.workspaceId } : {}),
      usedTools: payload.usedTools ?? [],
      usedAdapters: payload.usedAdapters ?? [],
      ...(payload.settings !== undefined ? { settings: payload.settings } : {}),
    };
    return Promise.resolve({
      resolvedPayload: { name: payload.name, description: payload.description, configuration },
      metadata: { source: "manual", generatedAt: now() },
      dependencies: ["project"],
      missingDependencies,
      conflicts: [],
      warnings: [],
      execute: async () => {
        if (!this.projectManager) managerNotConfigured("project");
        return this.projectManager.createProject(payload.name, payload.description, configuration);
      },
    });
  }

  private resolveTemplate(
    payload: import("./CreationTypes.js").TemplateCreationPayload
  ): Promise<ResolvedCreation> {
    const conflicts: CreationConflict[] = [];
    if (this.templateRegistry.has(payload.id)) {
      conflicts.push({
        field: "id",
        message: `ya existe una plantilla con id "${payload.id}".`,
        suggestions: this.validator.suggestAlternativeIds(payload.id),
      });
    }
    const definition: CreationTemplateDefinition = {
      id: payload.id,
      targetKind: payload.targetKind,
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.content !== undefined ? { content: payload.content } : {}),
      ...(payload.data !== undefined ? { data: payload.data } : {}),
      ...(payload.requiredVariables !== undefined
        ? { requiredVariables: payload.requiredVariables }
        : {}),
    };
    return Promise.resolve({
      resolvedId: payload.id,
      resolvedPayload: definition,
      metadata: { source: "manual", generatedAt: now() },
      dependencies: [],
      missingDependencies: [],
      conflicts,
      warnings: [],
      execute: () => {
        this.templateRegistry.register(definition);
        return Promise.resolve(definition);
      },
    });
  }

  // ---------------------------------------------------------------------
  // Eventos y verificación posterior
  // ---------------------------------------------------------------------

  private async notify(
    phase: string,
    operationId: string,
    kind: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `creation.${phase}`,
        { operationId, kind, ...payload },
        { correlationId: operationId }
      );
    }
    if (this.logger) {
      await this.logger
        .withCorrelationId(operationId)
        .info(`creation:${phase} ${kind} ${operationId}`);
    }
  }

  private async afterExecution(): Promise<void> {
    if (!this.verificationManager) return;
    try {
      await this.verificationManager.verify({ dryRun: true });
    } catch (err) {
      if (this.logger) {
        await this.logger.warn(
          `ai-creator-manager: la verificación posterior a la operación reportó un problema: ${errorMessage(err)}`
        );
      }
    }
  }
}
