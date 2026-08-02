import type { ModuleContext } from "./IModule.js";

/**
 * Contrato que debe implementar todo adaptador (ADR-001 §8). El Core trata
 * `subjectId` como una cadena opaca: no interpreta ni conoce si representa
 * "Git", "VS Code", "Kilo Code", "Windows", "macOS" o cualquier otro sistema
 * o herramienta. Esa interpretación pertenece exclusivamente a los módulos
 * que consuman el adaptador (por ejemplo, un futuro Tooling Manager).
 *
 * Ninguna implementación concreta de adaptadores forma parte de esta fase;
 * este archivo define únicamente el contrato que deberán cumplir.
 */
export interface IAdapter {
  /** Identificador único y estable del adaptador. */
  id: string;

  /** Identificador opaco de aquello que el adaptador gestiona. */
  subjectId: string;

  /** Versión propia del adaptador (semver recomendado). */
  version: string;

  /**
   * Versión del contrato `IAdapter` que el adaptador declara soportar
   * (ADR-001 §19). El Core rechaza el registro si es incompatible con la
   * versión de contrato que expone.
   */
  contractVersion: string;

  /** Inicialización del adaptador; recibe el mismo contexto mínimo que un módulo. */
  init(context: ModuleContext): Promise<void>;

  /** Liberación opcional de recursos al desregistrar el adaptador. */
  dispose?(): Promise<void>;
}
