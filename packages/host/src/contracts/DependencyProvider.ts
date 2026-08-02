/**
 * Resultado de construir una dependencia externa: el valor concreto y,
 * opcionalmente, una función de liberación que la pila de limpieza invocará
 * durante el rollback o el apagado (TDS-001 §5.1, §8.1).
 */
export interface ResolvedDependency<T = unknown> {
  readonly value: T;
  dispose?(): Promise<void>;
}

/**
 * Fábrica de una dependencia externa concreta, declarada en
 * `HostConfiguration.dependencyProviders` e indexada por el nombre que los
 * manifiestos declaran en `requiredDependencies` (TDS-001 §5).
 */
export type DependencyProvider<T = unknown> = () => Promise<ResolvedDependency<T>>;
