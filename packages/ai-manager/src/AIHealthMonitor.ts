import type { AIProviderRegistry } from "./AIProviderRegistry.js";
import { AIErrorCode } from "./errors/AIErrorCode.js";
import { AIError, createAIError } from "./errors/AIError.js";

export interface AIHealthMonitorOptions {
  readonly registry: AIProviderRegistry;
  readonly timeoutMs: number;
  /** Resuelve la credencial (si el proveedor la requiere) en el momento de la comprobación. */
  resolveCredential(credentialKey: string): Promise<string | undefined>;
  onChecked?(providerId: string, healthy: boolean, error?: string): void;
}

/**
 * Comprobación de salud de proveedores de IA registrados, con límite de
 * tiempo por comprobación. Actualiza el estado de conexión en el propio
 * `AIProviderRegistry` y, opcionalmente, notifica mediante `onChecked`.
 */
export class AIHealthMonitor {
  constructor(private readonly options: AIHealthMonitorOptions) {}

  async checkProvider(providerId: string): Promise<boolean> {
    const { provider, credentialKey } = this.options.registry.require(providerId);
    this.options.registry.updateConnectionStatus(providerId, "connecting");

    try {
      const credential = credentialKey
        ? await this.options.resolveCredential(credentialKey)
        : undefined;
      const healthy = await this.withTimeout(provider.healthCheck(credential), providerId);
      this.options.registry.updateConnectionStatus(providerId, healthy ? "connected" : "error");
      this.options.onChecked?.(providerId, healthy);
      return healthy;
    } catch (err) {
      const wrapped = AIError.wrap(err, {
        code: AIErrorCode.AI_HEALTH_CHECK_FAILED,
        origin: "health-check",
        recoverable: true,
        message: `Fallo en el health check del proveedor "${providerId}".`,
      });
      this.options.registry.updateConnectionStatus(providerId, "error", wrapped.message);
      this.options.onChecked?.(providerId, false, wrapped.message);
      return false;
    }
  }

  async checkAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const providerId of this.options.registry.list()) {
      results.set(providerId, await this.checkProvider(providerId));
    }
    return results;
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
                message: `El health check del proveedor "${providerId}" superó el tiempo máximo.`,
                origin: "health-check",
                recoverable: true,
              })
            );
          }, this.options.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
