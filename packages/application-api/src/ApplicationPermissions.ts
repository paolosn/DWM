import type { ApplicationCapability } from "./ApplicationTypes.js";
import type { ApplicationCallerContext } from "./ApplicationRequest.js";

export interface OperationPermissionDescriptor {
  readonly operation: string;
  readonly capabilities: readonly ApplicationCapability[];
  readonly destructive: boolean;
}

/**
 * Sistema local de permisos y capacidades (README §Permisos). No implementa
 * usuarios, login ni autenticación remota: solo decide, para una operación
 * ya conocida, si el `caller` de la solicitud puede ejecutarla.
 *
 * Regla de cierre: cualquier operación no registrada explícitamente se
 * deniega por defecto (`check()` devuelve `false`), y un contexto
 * privilegiado (`caller.privileged === true`) es la única vía explícita de
 * saltarse la comprobación de capacidades — nunca ocurre implícitamente.
 */
export class ApplicationPermissions {
  private readonly descriptors = new Map<string, OperationPermissionDescriptor>();

  register(
    operation: string,
    capabilities: readonly ApplicationCapability[],
    options: { destructive?: boolean } = {}
  ): void {
    this.descriptors.set(operation, {
      operation,
      capabilities,
      destructive: options.destructive ?? false,
    });
  }

  describe(operation: string): OperationPermissionDescriptor | undefined {
    return this.descriptors.get(operation);
  }

  isDestructive(operation: string): boolean {
    return this.descriptors.get(operation)?.destructive ?? false;
  }

  requiredCapabilities(operation: string): readonly ApplicationCapability[] {
    return this.descriptors.get(operation)?.capabilities ?? [];
  }

  /** Comprueba si `caller` puede ejecutar `operation`. Deniega por defecto si la operación no está registrada. */
  check(operation: string, caller: ApplicationCallerContext | undefined): boolean {
    const descriptor = this.descriptors.get(operation);
    if (!descriptor) return false;
    if (caller?.privileged === true) return true;

    const granted = new Set(caller?.grantedCapabilities ?? []);
    return descriptor.capabilities.every((capability) => granted.has(capability));
  }

  listCapabilities(): readonly ApplicationCapability[] {
    const set = new Set<ApplicationCapability>();
    for (const descriptor of this.descriptors.values()) {
      for (const capability of descriptor.capabilities) set.add(capability);
    }
    return Array.from(set);
  }

  listOperations(): readonly OperationPermissionDescriptor[] {
    return Array.from(this.descriptors.values());
  }
}
