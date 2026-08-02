import type { CreationKind } from "./CreationTypes.js";
import { CreationErrorCode } from "./errors/CreationErrorCode.js";
import { createCreationError } from "./errors/CreationError.js";

/**
 * Definición de un prompt reutilizable dirigido a un proveedor de IA
 * (todavía no implementado — ver `ProviderInterface`). Es texto libre con
 * marcadores `{{variable}}`; `PromptRegistry` los guarda en memoria y
 * `renderPromptTemplate()` los rellena antes de pasárselos a un
 * `AIProvider.generate()`.
 */
export interface PromptTemplateDefinition {
  readonly id: string;
  readonly kind: CreationKind;
  readonly description?: string;
  readonly template: string;
  readonly requiredVariables?: readonly string[];
}

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Extrae, sin duplicados y en orden de aparición, los nombres de variable `{{x}}` presentes en `template`. */
export function extractTemplateVariables(template: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    found.push(name);
  }
  return found;
}

/** Sustituye cada `{{variable}}` de `template` por su valor en `variables`. Lanza si falta alguna variable requerida. */
export function renderPromptTemplate(
  definition: Pick<PromptTemplateDefinition, "id" | "template" | "requiredVariables">,
  variables: Readonly<Record<string, string>> = {}
): string {
  const required = definition.requiredVariables ?? extractTemplateVariables(definition.template);
  const missing = required.filter((name) => variables[name] === undefined);
  if (missing.length > 0) {
    throw createCreationError({
      code: CreationErrorCode.CREATION_TEMPLATE_VARIABLES_MISSING,
      message: `Faltan variables para renderizar el prompt "${definition.id}": ${missing.join(", ")}.`,
      origin: "prompt",
      recoverable: true,
    });
  }
  return definition.template.replace(VARIABLE_PATTERN, (full, name: string) => {
    const value = variables[name];
    return value !== undefined ? value : full;
  });
}
