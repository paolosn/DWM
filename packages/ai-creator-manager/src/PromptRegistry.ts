import type { CreationKind } from "./CreationTypes.js";
import type { PromptTemplateDefinition } from "./PromptTemplate.js";
import { CreationErrorCode } from "./errors/CreationErrorCode.js";
import { createCreationError } from "./errors/CreationError.js";

/**
 * Mantiene en memoria —nunca persistido— el catálogo de prompts
 * reutilizables para proveedores de IA. Es deliberadamente independiente
 * de `CreationTemplateRegistry` (plantillas de contenido final): los
 * prompts son instrucciones para un `AIProvider` todavía no implementado,
 * mientras que las plantillas de creación ya producen contenido usable
 * directamente, sin IA de por medio.
 */
export class PromptRegistry {
  private readonly prompts = new Map<string, PromptTemplateDefinition>();

  register(definition: PromptTemplateDefinition): void {
    if (this.prompts.has(definition.id)) {
      throw createCreationError({
        code: CreationErrorCode.CREATION_PROMPT_ALREADY_EXISTS,
        message: `Ya existe un prompt registrado con id "${definition.id}".`,
        origin: "prompt",
        recoverable: true,
      });
    }
    this.prompts.set(definition.id, definition);
  }

  get(id: string): PromptTemplateDefinition | undefined {
    return this.prompts.get(id);
  }

  require(id: string): PromptTemplateDefinition {
    const definition = this.prompts.get(id);
    if (!definition) {
      throw createCreationError({
        code: CreationErrorCode.CREATION_PROMPT_NOT_FOUND,
        message: `No existe ningún prompt registrado con id "${id}".`,
        origin: "prompt",
        recoverable: true,
      });
    }
    return definition;
  }

  has(id: string): boolean {
    return this.prompts.has(id);
  }

  remove(id: string): void {
    this.prompts.delete(id);
  }

  list(kind?: CreationKind): PromptTemplateDefinition[] {
    const all = [...this.prompts.values()].sort((a, b) => a.id.localeCompare(b.id));
    return kind ? all.filter((definition) => definition.kind === kind) : all;
  }

  clear(): void {
    this.prompts.clear();
  }
}
