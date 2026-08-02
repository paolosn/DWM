import type { CreationKind } from "./CreationTypes.js";
import { extractTemplateVariables } from "./PromptTemplate.js";
import { CreationErrorCode } from "./errors/CreationErrorCode.js";
import { createCreationError } from "./errors/CreationError.js";

/**
 * Plantilla reutilizable de contenido final para un tipo de recurso
 * concreto. A diferencia de `PromptTemplateDefinition` (instrucciones
 * para un proveedor de IA todavía no implementado), una
 * `CreationTemplateDefinition` ya contiene contenido o datos usables tal
 * cual —tras sustituir sus variables `{{x}}`— sin necesidad de ninguna
 * IA. Es el mecanismo principal de "reutilizar plantillas" de este
 * módulo mientras no haya proveedores reales conectados.
 */
export interface CreationTemplateDefinition {
  readonly id: string;
  readonly targetKind: Exclude<CreationKind, "template">;
  readonly description?: string;
  /** Contenido en bruto (Markdown/texto), usado por skill, rule y knowledge. */
  readonly content?: string;
  /** Datos estructurados, usados por agent (y disponibles para cualquier otro tipo que los necesite). */
  readonly data?: Readonly<Record<string, unknown>>;
  readonly requiredVariables?: readonly string[];
}

/** Recorre recursivamente `value` sustituyendo `{{variable}}` en cada cadena, dejando el resto intacto. */
function renderValue(value: unknown, variables: Readonly<Record<string, string>>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, name: string) =>
      variables[name] !== undefined ? variables[name] : full
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderValue(item, variables));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = renderValue(nested, variables);
    }
    return result;
  }
  return value;
}

export interface RenderedCreationTemplate {
  readonly content?: string;
  readonly data?: Record<string, unknown>;
}

/** Aplica `variables` sobre una plantilla ya resuelta (`definition`), validando que no falte ninguna requerida. */
export function renderCreationTemplate(
  definition: CreationTemplateDefinition,
  variables: Readonly<Record<string, string>> = {}
): RenderedCreationTemplate {
  const required =
    definition.requiredVariables ??
    (definition.content ? extractTemplateVariables(definition.content) : []);
  const missing = required.filter((name) => variables[name] === undefined);
  if (missing.length > 0) {
    throw createCreationError({
      code: CreationErrorCode.CREATION_TEMPLATE_VARIABLES_MISSING,
      message: `Faltan variables para renderizar la plantilla "${definition.id}": ${missing.join(", ")}.`,
      origin: "template",
      recoverable: true,
    });
  }
  return {
    ...(definition.content !== undefined
      ? { content: renderValue(definition.content, variables) as string }
      : {}),
    ...(definition.data !== undefined
      ? { data: renderValue(definition.data, variables) as Record<string, unknown> }
      : {}),
  };
}

/**
 * Mantiene en memoria —nunca persistido— el catálogo de plantillas de
 * creación disponibles. `AICreatorManager` la expone para poder
 * registrar, consultar y reutilizar plantillas al crear agentes, skills,
 * reglas, conocimiento, clientes o proyectos.
 */
export class CreationTemplateRegistry {
  private readonly templates = new Map<string, CreationTemplateDefinition>();

  register(definition: CreationTemplateDefinition): void {
    if (this.templates.has(definition.id)) {
      throw createCreationError({
        code: CreationErrorCode.CREATION_TEMPLATE_ALREADY_EXISTS,
        message: `Ya existe una plantilla registrada con id "${definition.id}".`,
        origin: "template",
        recoverable: true,
      });
    }
    this.templates.set(definition.id, definition);
  }

  /** Registra la plantilla, sobrescribiendo cualquier versión previa con el mismo id. */
  upsert(definition: CreationTemplateDefinition): void {
    this.templates.set(definition.id, definition);
  }

  get(id: string): CreationTemplateDefinition | undefined {
    return this.templates.get(id);
  }

  require(id: string): CreationTemplateDefinition {
    const definition = this.templates.get(id);
    if (!definition) {
      throw createCreationError({
        code: CreationErrorCode.CREATION_TEMPLATE_NOT_FOUND,
        message: `No existe ninguna plantilla registrada con id "${id}".`,
        origin: "template",
        recoverable: true,
      });
    }
    return definition;
  }

  has(id: string): boolean {
    return this.templates.has(id);
  }

  remove(id: string): void {
    this.templates.delete(id);
  }

  list(targetKind?: CreationKind): CreationTemplateDefinition[] {
    const all = [...this.templates.values()].sort((a, b) => a.id.localeCompare(b.id));
    return targetKind ? all.filter((definition) => definition.targetKind === targetKind) : all;
  }

  clear(): void {
    this.templates.clear();
  }
}
