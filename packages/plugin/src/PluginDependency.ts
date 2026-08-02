export interface PluginDependency {
  readonly pluginId: string;
  /** Versión mínima (semver) del plugin dependido que se considera compatible. */
  readonly minVersion?: string;
  readonly optional: boolean;
}
