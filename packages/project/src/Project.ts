import type { ProjectMetadata } from "./ProjectMetadata.js";
import type { ProjectConfiguration } from "./ProjectConfiguration.js";
import type { ProjectState } from "./ProjectState.js";

/**
 * Representación en memoria de un proyecto: sus metadatos, su
 * configuración (incluido el perfil único al que está asociado) y su
 * estado actual. Es un contenedor de datos con transiciones de estado
 * controladas; la orquestación (crear, abrir, persistir...) corresponde a
 * `ProjectManager`.
 */
export class Project {
  private currentMetadata: ProjectMetadata;
  private currentConfiguration: ProjectConfiguration;
  private currentState: ProjectState = "created";

  constructor(metadata: ProjectMetadata, configuration: ProjectConfiguration) {
    this.currentMetadata = metadata;
    this.currentConfiguration = configuration;
  }

  get id(): string {
    return this.currentMetadata.id;
  }

  get metadata(): ProjectMetadata {
    return this.currentMetadata;
  }

  get configuration(): ProjectConfiguration {
    return this.currentConfiguration;
  }

  get state(): ProjectState {
    return this.currentState;
  }

  setMetadata(metadata: ProjectMetadata): void {
    this.currentMetadata = metadata;
  }

  setConfiguration(configuration: ProjectConfiguration): void {
    this.currentConfiguration = configuration;
  }

  setState(state: ProjectState): void {
    this.currentState = state;
  }
}
