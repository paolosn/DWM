import type { AIProvider } from "./AIProvider.js";
import type { AIConnection } from "./AIConnection.js";
import { initialConnection, withStatus, type ConnectionStatus } from "./AIConnection.js";
import { AIErrorCode } from "./errors/AIErrorCode.js";
import { createAIError } from "./errors/AIError.js";

export interface RegisteredProvider {
  readonly provider: AIProvider;
  readonly credentialKey?: string;
}

/** Mantiene el conjunto de proveedores de IA registrados, sus conexiones y cuál está activo. */
export class AIProviderRegistry {
  private readonly providers = new Map<string, RegisteredProvider>();
  private readonly connections = new Map<string, AIConnection>();
  private activeId: string | null = null;

  register(provider: AIProvider, credentialKey?: string, setActive = false): void {
    if (this.providers.has(provider.id)) {
      throw createAIError({
        code: AIErrorCode.AI_PROVIDER_ALREADY_REGISTERED,
        message: `Ya existe un proveedor de IA registrado con id "${provider.id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.providers.set(
      provider.id,
      credentialKey !== undefined ? { provider, credentialKey } : { provider }
    );
    this.connections.set(provider.id, initialConnection(provider.id));
    if (this.activeId === null || setActive) this.activeId = provider.id;
  }

  unregister(id: string): void {
    this.providers.delete(id);
    this.connections.delete(id);
    if (this.activeId === id) {
      const next = this.providers.keys().next();
      this.activeId = next.done ? null : next.value;
    }
  }

  get(id: string): RegisteredProvider | undefined {
    return this.providers.get(id);
  }

  require(id: string): RegisteredProvider {
    const entry = this.providers.get(id);
    if (!entry) {
      throw createAIError({
        code: AIErrorCode.AI_PROVIDER_NOT_FOUND,
        message: `No existe ningún proveedor de IA registrado con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return entry;
  }

  list(): string[] {
    return [...this.providers.keys()].sort();
  }

  setActive(id: string): void {
    this.require(id);
    this.activeId = id;
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  requireActive(): RegisteredProvider {
    if (!this.activeId) {
      throw createAIError({
        code: AIErrorCode.AI_NO_ACTIVE_PROVIDER,
        message: "No hay ningún proveedor de IA activo.",
        origin: "registry",
        recoverable: true,
      });
    }
    return this.require(this.activeId);
  }

  getConnection(id: string): AIConnection | undefined {
    return this.connections.get(id);
  }

  updateConnectionStatus(id: string, status: ConnectionStatus, error?: string): void {
    const current = this.connections.get(id);
    if (!current) return;
    this.connections.set(id, withStatus(current, status, error));
  }

  clear(): void {
    this.providers.clear();
    this.connections.clear();
    this.activeId = null;
  }
}
