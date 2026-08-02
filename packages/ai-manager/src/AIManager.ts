import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler, TaskHandle } from "@dwm/scheduler";
import { computeBackoffDelay } from "@dwm/scheduler";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { AIProvider } from "./AIProvider.js";
import type { AIProviderFactory } from "./AIProviderFactory.js";
import { AIProviderRegistry } from "./AIProviderRegistry.js";
import { AIHealthMonitor } from "./AIHealthMonitor.js";
import type { AIConnection } from "./AIConnection.js";
import type { AIRequest } from "./AIRequest.js";
import type { AIResponse } from "./AIResponse.js";
import type { AIConfiguration } from "./AIConfiguration.js";
import { validateAIConfiguration } from "./AIConfiguration.js";
import { AIErrorCode } from "./errors/AIErrorCode.js";
import { AIError, createAIError } from "./errors/AIError.js";

export interface RegisterProviderOptions {
  readonly credentialKey?: string;
  readonly setActive?: boolean;
}

export interface AIManagerOptions {
  readonly configuration: AIConfiguration;
  readonly secretsManager?: SecretsManager;
  readonly configManager?: ConfigManager;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
}

type AIEventPhase =
  | "provider.registered"
  | "provider.unregistered"
  | "provider.activated"
  | "request.success"
  | "request.error"
  | "health.ok"
  | "health.error";

const HEALTH_CHECK_TASK_ID = "ai-manager-health-check";

/**
 * Módulo de gestión de proveedores de IA del sistema DWM. Implementa
 * `IModule` (ADR-002 §3): se registra en el Core mediante `registerModule`,
 * recibe únicamente el `ModuleContext` mínimo, y no contiene lógica de
 * ninguna herramienta o sistema operativo. Ninguna credencial se retiene
 * más allá de una única llamada: se resuelve mediante `@dwm/secrets`
 * inmediatamente antes de cada solicitud o health check.
 */
export class AIManager implements IModule {
  readonly id = "ai-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new AIProviderRegistry();
  private readonly healthMonitor: AIHealthMonitor;
  private readonly configuration: AIConfiguration;
  private readonly secretsManager?: SecretsManager;
  private readonly configManager?: ConfigManager;
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly scheduler?: Scheduler;
  private healthCheckTaskHandle?: TaskHandle;

  constructor(options: AIManagerOptions) {
    validateAIConfiguration(options.configuration);
    this.configuration = options.configuration;
    if (options.secretsManager) this.secretsManager = options.secretsManager;
    if (options.configManager) this.configManager = options.configManager;
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.scheduler) this.scheduler = options.scheduler;

    this.healthMonitor = new AIHealthMonitor({
      registry: this.registry,
      timeoutMs: this.configuration.timeoutMs,
      resolveCredential: (key) => this.resolveCredential(key),
      onChecked: (providerId, healthy, error) => {
        void this.notify(healthy ? "health.ok" : "health.error", providerId, error);
      },
    });
  }

  registerProvider(provider: AIProvider, options: RegisterProviderOptions = {}): void {
    this.registry.register(provider, options.credentialKey, options.setActive ?? false);
    void this.notify("provider.registered", provider.id);
  }

  async registerProviderFactory(
    factory: AIProviderFactory,
    options: RegisterProviderOptions = {}
  ): Promise<AIProvider> {
    const provider = await factory.create();
    this.registerProvider(provider, options);
    return provider;
  }

  unregisterProvider(id: string): void {
    this.registry.require(id);
    this.registry.unregister(id);
    void this.notify("provider.unregistered", id);
  }

  setActiveProvider(id: string): void {
    this.registry.setActive(id);
    void this.notify("provider.activated", id);
  }

  getActiveProviderId(): string | null {
    return this.registry.getActiveId();
  }

  listProviders(): string[] {
    return this.registry.list();
  }

  getConnection(id: string): AIConnection | undefined {
    return this.registry.getConnection(id);
  }

  async checkHealth(providerId?: string): Promise<boolean> {
    const id = providerId ?? this.registry.requireActive().provider.id;
    return this.healthMonitor.checkProvider(id);
  }

  /** Envía una solicitud al proveedor indicado (o al activo), con timeout y reintentos con backoff. */
  async sendRequest(request: AIRequest, providerId?: string): Promise<AIResponse> {
    const id = providerId ?? this.registry.requireActive().provider.id;
    const entry = this.registry.require(id);
    const maxAttempts = this.configuration.retry.maxAttempts;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      try {
        const credential = entry.credentialKey
          ? await this.resolveCredential(entry.credentialKey)
          : undefined;
        const raw = await this.withTimeout(entry.provider.sendRequest(request, credential), id);
        const response: AIResponse = {
          providerId: id,
          attempt,
          latencyMs: Date.now() - startedAt,
          ...raw,
        };
        this.registry.updateConnectionStatus(id, "connected");
        await this.notify("request.success", id);
        return response;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        this.registry.updateConnectionStatus(id, "error", message);
        await this.notify("request.error", id, message);
        if (attempt < maxAttempts) {
          const delay = computeBackoffDelay(this.configuration.retry.backoff, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw AIError.wrap(lastError, {
      code: AIErrorCode.AI_REQUEST_FAILED,
      origin: "request",
      recoverable: true,
      message: `La solicitud al proveedor "${id}" falló tras ${maxAttempts} intento(s).`,
    });
  }

  async init(context: ModuleContext): Promise<void> {
    // Integración con la configuración normalizada del Core (ADR-002 §8.3),
    // consistente con el patrón ya usado por los demás módulos.
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("ai-manager", {
        providers: this.registry.list(),
        activeProviderId: this.registry.getActiveId(),
      });
    }

    if (this.scheduler && this.configuration.healthCheckIntervalMs) {
      this.healthCheckTaskHandle = this.scheduler.schedule(
        () => this.healthMonitor.checkAll().then(() => undefined),
        { id: HEALTH_CHECK_TASK_ID, intervalMs: this.configuration.healthCheckIntervalMs }
      );
    }

    context.reportStatus(SystemStatus.OK, "ai-manager inicializado");
  }

  async dispose(): Promise<void> {
    this.healthCheckTaskHandle?.cancel();
  }

  private async resolveCredential(credentialKey: string): Promise<string | undefined> {
    if (!this.secretsManager) {
      throw createAIError({
        code: AIErrorCode.AI_CREDENTIAL_MISSING,
        message: `Se requiere la credencial "${credentialKey}" pero no hay ningún SecretsManager configurado.`,
        origin: "credential",
        recoverable: true,
      });
    }
    const value = await this.secretsManager.getSecret(credentialKey);
    if (value === undefined) {
      throw createAIError({
        code: AIErrorCode.AI_CREDENTIAL_MISSING,
        message: `No existe ningún secreto con la clave "${credentialKey}".`,
        origin: "credential",
        recoverable: true,
      });
    }
    return value;
  }

  private async withTimeout<T>(promise: Promise<T>, providerId: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(
              createAIError({
                code: AIErrorCode.AI_REQUEST_TIMEOUT,
                message: `La solicitud al proveedor "${providerId}" superó el tiempo máximo de ${this.configuration.timeoutMs}ms.`,
                origin: "request",
                recoverable: true,
              })
            );
          }, this.configuration.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async notify(phase: AIEventPhase, providerId: string, error?: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `ai.${phase}`,
        { providerId, ...(error !== undefined ? { error } : {}) },
        { correlationId: providerId }
      );
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(providerId);
      if (phase.includes("error")) {
        await logger.error(`ai:${phase} ${providerId}`, error !== undefined ? { error } : {});
      } else {
        await logger.info(`ai:${phase} ${providerId}`);
      }
    }
  }
}
