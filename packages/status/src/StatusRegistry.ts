import type { StatusProvider } from "./StatusTypes.js";
import { StatusErrorCode } from "./errors/StatusErrorCode.js";
import { createStatusError } from "./errors/StatusError.js";

/**
 * Mantiene el conjunto de proveedores de estado conocidos. Es el punto de
 * extensión del módulo: añadir un nuevo proveedor (de un módulo futuro o
 * de cualquier subsistema) solo requiere `register()`, sin tocar
 * `StatusManager` ni ningún otro módulo existente.
 */
export class StatusRegistry {
  private readonly providers = new Map<string, StatusProvider>();

  register(provider: StatusProvider): void {
    if (!provider || typeof provider.id !== "string" || provider.id.length === 0) {
      throw createStatusError({
        code: StatusErrorCode.STATUS_INVALID_PROVIDER,
        message: "El proveedor de estado debe declarar un id no vacío.",
        origin: "registry",
        recoverable: false,
      });
    }
    if (typeof provider.getStatus !== "function") {
      throw createStatusError({
        code: StatusErrorCode.STATUS_INVALID_PROVIDER,
        message: `El proveedor de estado "${provider.id}" debe implementar getStatus().`,
        origin: "registry",
        recoverable: false,
      });
    }
    if (this.providers.has(provider.id)) {
      throw createStatusError({
        code: StatusErrorCode.STATUS_PROVIDER_ALREADY_REGISTERED,
        message: `Ya existe un proveedor de estado registrado con id "${provider.id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.providers.delete(id);
  }

  get(id: string): StatusProvider | undefined {
    return this.providers.get(id);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  require(id: string): StatusProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw createStatusError({
        code: StatusErrorCode.STATUS_PROVIDER_NOT_FOUND,
        message: `No existe ningún proveedor de estado registrado con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return provider;
  }

  list(): string[] {
    return [...this.providers.keys()].sort();
  }

  clear(): void {
    this.providers.clear();
  }
}
