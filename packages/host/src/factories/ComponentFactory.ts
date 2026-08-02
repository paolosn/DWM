import type { ComponentBundle } from "../bundles/ComponentBundle.js";

/**
 * Contrato de fábrica (TDS-001 §2.3). Una fábrica:
 * - No conoce `DependencyContainer`: recibe únicamente los valores concretos
 *   que necesita, ya resueltos por CompositionRoot.
 * - No conoce `DWMCore`: no registra su propio componente.
 * - No conoce otras fábricas ni sus componentes.
 * - Solo construye y devuelve su `ComponentBundle`.
 *
 * `dependencies` contiene, indexado por nombre, exactamente los valores que
 * el manifiesto del componente declaró en `requiredDependencies`, ya
 * resueltos. La fábrica no realiza ninguna búsqueda dinámica adicional.
 */
export interface ComponentFactory {
  build(dependencies: Readonly<Record<string, unknown>>): Promise<ComponentBundle>;
}

/** Alias semánticos usados por HostConfiguration y CompositionRoot (TDS-001 §2.3). */
export type ModuleFactory = ComponentFactory;
export type AdapterFactory = ComponentFactory;
