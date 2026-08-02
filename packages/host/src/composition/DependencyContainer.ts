import type { ResolvedDependency } from "../contracts/DependencyProvider.js";

/**
 * Mecanismo explícito (no un framework de terceros) que almacena las
 * dependencias externas ya construidas, indexadas por el nombre del
 * contrato que representan (TDS-001 §2.4). Ninguna fábrica, módulo,
 * adaptador o coordinador tiene acceso a esta clase; solo `CompositionRoot`
 * la instancia y la consulta.
 */
export class DependencyContainer {
  private readonly values = new Map<string, unknown>();
  private readonly disposers = new Map<string, () => Promise<void>>();

  set(name: string, resolved: ResolvedDependency): void {
    this.values.set(name, resolved.value);
    if (resolved.dispose) {
      this.disposers.set(name, resolved.dispose);
    }
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  get(name: string): unknown {
    return this.values.get(name);
  }

  getDisposer(name: string): (() => Promise<void>) | undefined {
    return this.disposers.get(name);
  }

  names(): readonly string[] {
    return [...this.values.keys()];
  }

  /** Devuelve exactamente el subconjunto de dependencias que una fábrica declaró necesitar. */
  resolveFor(requiredDependencyNames: readonly string[]): Readonly<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const name of requiredDependencyNames) {
      result[name] = this.values.get(name);
    }
    return result;
  }
}
