import type { ProfileMetadata } from "./ProfileMetadata.js";
import type { ProfileConfiguration } from "./ProfileConfiguration.js";
import type { ProfileState } from "./ProfileState.js";

/**
 * Representación en memoria de un perfil: sus metadatos, su configuración
 * y su estado actual. Es un contenedor de datos con transiciones de estado
 * controladas; la orquestación (crear, activar, persistir...) corresponde
 * a `ProfileManager`.
 */
export class Profile {
  private currentMetadata: ProfileMetadata;
  private currentConfiguration: ProfileConfiguration;
  private currentState: ProfileState = "created";

  constructor(metadata: ProfileMetadata, configuration: ProfileConfiguration) {
    this.currentMetadata = metadata;
    this.currentConfiguration = configuration;
  }

  get id(): string {
    return this.currentMetadata.id;
  }

  get metadata(): ProfileMetadata {
    return this.currentMetadata;
  }

  get configuration(): ProfileConfiguration {
    return this.currentConfiguration;
  }

  get state(): ProfileState {
    return this.currentState;
  }

  setMetadata(metadata: ProfileMetadata): void {
    this.currentMetadata = metadata;
  }

  setConfiguration(configuration: ProfileConfiguration): void {
    this.currentConfiguration = configuration;
  }

  setState(state: ProfileState): void {
    this.currentState = state;
  }
}
