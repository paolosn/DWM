/**
 * Tipo de componente que describe un manifiesto (TDS-001 §11.3).
 */
export type ComponentKind = "module" | "adapter";

/**
 * Capacidad provista por un componente: nombre y versión semántica propia
 * de esa capacidad (TDS-001 §11.3, ADR-002 §11).
 */
export interface ProvidedCapability {
  readonly name: string;
  readonly version: string;
}

/**
 * Capacidad requerida por un componente de otro componente del grafo.
 * `mandatory` indica si, en ausencia de esta capacidad, el propio
 * componente debe tratarse como fallido (TDS-001 §12).
 */
export interface RequiredCapability {
  readonly name: string;
  readonly version: string;
  readonly mandatory: boolean;
}

/**
 * Manifiesto externo asociado a una fábrica (TDS-001 §11.1-§11.3). No
 * modifica IModule/IAdapter/ModuleContext: es una estructura de datos
 * propia de la capa host, interpretada exclusivamente por CompositionRoot.
 */
export interface ComponentManifest {
  /** Debe coincidir con el `id` que la instancia de ciclo de vida declarará. */
  readonly id: string;
  readonly kind: ComponentKind;
  /** Obligatorio y no vacío únicamente para `kind === "adapter"`. */
  readonly subjectId?: string;
  /** Versión propia del componente (semver). */
  readonly version: string;
  /** Versión de contrato IModule/IAdapter que el componente declara soportar. */
  readonly contractVersion: string;
  /** Versión semántica del propio manifiesto (ADR-002 §12). */
  readonly manifestVersion: string;
  /** Si un fallo de este componente debe abortar toda la inicialización. */
  readonly mandatory: boolean;
  readonly providedCapabilities: readonly ProvidedCapability[];
  readonly requiredCapabilities: readonly RequiredCapability[];
  /**
   * Nombres de las dependencias externas (sección 5 de TDS-001) que la
   * fábrica de este componente necesita recibir ya resueltas.
   */
  readonly requiredDependencies: readonly string[];
}
