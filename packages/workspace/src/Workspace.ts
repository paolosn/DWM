import type { WorkspaceMetadata } from "./WorkspaceMetadata.js";
import type { WorkspaceConfiguration } from "./WorkspaceConfiguration.js";
import type { WorkspaceState } from "./WorkspaceState.js";
import type { WorkspaceIndex } from "./WorkspaceScanner.js";

/**
 * Representación en memoria de un workspace: sus metadatos, su
 * configuración, su estado actual y el último índice escaneado (que actúa
 * como caché básica para la detección de cambios). Es un contenedor de
 * datos con transiciones de estado controladas; la orquestación de
 * operaciones (crear, abrir, cerrar, escanear...) corresponde a
 * `WorkspaceManager`.
 */
export class Workspace {
  private currentMetadata: WorkspaceMetadata;
  private currentConfiguration: WorkspaceConfiguration;
  private currentState: WorkspaceState = "created";
  private currentIndex: WorkspaceIndex | null = null;

  constructor(metadata: WorkspaceMetadata, configuration: WorkspaceConfiguration) {
    this.currentMetadata = metadata;
    this.currentConfiguration = configuration;
  }

  get id(): string {
    return this.currentMetadata.id;
  }

  get rootPath(): string {
    return this.currentMetadata.rootPath;
  }

  get metadata(): WorkspaceMetadata {
    return this.currentMetadata;
  }

  get configuration(): WorkspaceConfiguration {
    return this.currentConfiguration;
  }

  get state(): WorkspaceState {
    return this.currentState;
  }

  get index(): WorkspaceIndex | null {
    return this.currentIndex;
  }

  setMetadata(metadata: WorkspaceMetadata): void {
    this.currentMetadata = metadata;
  }

  setConfiguration(configuration: WorkspaceConfiguration): void {
    this.currentConfiguration = configuration;
  }

  setState(state: WorkspaceState): void {
    this.currentState = state;
  }

  setIndex(index: WorkspaceIndex): void {
    this.currentIndex = index;
  }
}
