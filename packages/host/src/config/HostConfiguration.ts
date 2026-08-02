import type { ComponentManifest } from "../manifests/ComponentManifest.js";
import type { ComponentFactory } from "../factories/ComponentFactory.js";
import type { DependencyProvider } from "../contracts/DependencyProvider.js";

/**
 * Descriptor de un componente habilitado (TDS-001 §10): asocia un
 * manifiesto con la fábrica que sabe construirlo.
 */
export interface ComponentDescriptor {
  readonly manifest: ComponentManifest;
  readonly factory: ComponentFactory;
  /** Si es `false`, el componente se omite ("omitido por configuración") sin evaluarse en el grafo. */
  readonly enabled: boolean;
}

/**
 * Descriptor de un caso de uso (TDS-001 §6): declara qué componentes
 * habilitados necesita (por id) y la función que, recibiendo únicamente
 * las superficies públicas de dominio de esos componentes, resuelve la
 * operación. El propio host no conoce el significado de negocio del caso
 * de uso; solo lo ejecuta cuando se le solicita (sección 15).
 */
export interface UseCaseDescriptor {
  readonly id: string;
  readonly requiredComponentIds: readonly string[];
  handle(domainSurfaces: Readonly<Record<string, unknown>>, input: unknown): Promise<unknown>;
}

/**
 * Estructura de datos pasiva (TDS-001 §10) que describe cómo ensamblar y
 * ejecutar la aplicación. No contiene credenciales ni configuración
 * funcional de negocio.
 */
export interface HostConfiguration {
  /** Ubicación lógica de SISTEMA-DE-TRABAJO (TDS-001 §4, paso 7). */
  readonly workspaceRoot: string;
  /** Componentes que la capa host debe componer en esta ejecución. */
  readonly components: readonly ComponentDescriptor[];
  /** Fábricas de dependencias externas, indexadas por el nombre que los manifiestos declaran. */
  readonly dependencyProviders: Readonly<Record<string, DependencyProvider>>;
  /** Casos de uso que `ApplicationHost.executeUseCase` podrá ejecutar en RUNNING. */
  readonly useCases: readonly UseCaseDescriptor[];
}
