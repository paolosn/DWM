/**
 * Catálogo cerrado de tipos de recurso que `@dwm/ai-creator-manager` sabe
 * orquestar. Cada uno se materializa delegando por completo en la API
 * pública del manager correspondiente ya existente en el monorepo; este
 * módulo nunca escribe directamente en el sistema de ficheros.
 */
export const CREATION_KINDS = [
  "agent",
  "skill",
  "rule",
  "knowledge",
  "client",
  "project",
  "template",
] as const;
export type CreationKind = (typeof CREATION_KINDS)[number];

export function isCreationKind(value: unknown): value is CreationKind {
  return typeof value === "string" && (CREATION_KINDS as readonly string[]).includes(value);
}

/** Origen del contenido finalmente usado para materializar el recurso. */
export type CreationSource = "manual" | "template" | "provider";

export interface CreationMetadata {
  readonly source: CreationSource;
  readonly templateId?: string;
  readonly promptId?: string;
  readonly providerId?: string;
  readonly generatedAt: string;
}

// ---------------------------------------------------------------------
// Payloads por tipo de recurso. `id` es siempre opcional: si se omite,
// se puede resolver a partir de una plantilla o, en su ausencia, el
// manager de destino decide si lo requiere (fallará con su propio error
// si lo exige y no se indicó ninguno).
// ---------------------------------------------------------------------

/**
 * Todo payload que produce contenido/datos (agent, skill, rule,
 * knowledge) admite, además de un valor manual directo, resolverlo por
 * plantilla (`templateId`) o —en el futuro, cuando haya proveedores
 * reales conectados— pidiéndoselo a un `AIProvider` mediante un prompt
 * registrado (`promptId` + `providerId`). Nunca se combinan silenciosamente
 * más de una fuente: `CreationPipeline` exige que como mucho una de
 * `content`/`data` manual, `templateId` o `promptId` esté presente.
 */
export interface GeneratedContentPayload {
  readonly templateId?: string;
  readonly promptId?: string;
  readonly providerId?: string;
  readonly variables?: Readonly<Record<string, string>>;
}

export interface AgentCreationPayload extends GeneratedContentPayload {
  readonly id?: string;
  readonly content?: string;
}

export interface SkillCreationPayload extends GeneratedContentPayload {
  readonly id?: string;
  readonly content?: string;
}

export interface RuleCreationPayload extends GeneratedContentPayload {
  readonly id?: string;
  readonly content?: string;
}

export interface KnowledgeCreationPayload extends GeneratedContentPayload {
  readonly id?: string;
  readonly content?: string;
  readonly tags?: readonly string[];
  readonly category?: string;
}

export interface ClientCreationPayload {
  readonly id?: string;
  readonly name: string;
  readonly slug?: string;
  readonly status?: string;
  readonly tags?: readonly string[];
  readonly description?: string;
}

export interface ProjectCreationPayload {
  readonly name: string;
  readonly description: string;
  readonly projectPath: string;
  readonly profileId: string;
  readonly workspaceId?: string;
  readonly usedTools?: readonly string[];
  readonly usedAdapters?: readonly string[];
  readonly settings?: Readonly<Record<string, unknown>>;
}

export interface TemplateCreationPayload {
  readonly id: string;
  readonly targetKind: Exclude<CreationKind, "template">;
  readonly description?: string;
  readonly content?: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly requiredVariables?: readonly string[];
}

/** Petición de creación discriminada por `kind`, cada una con el payload propio de su tipo de recurso. */
export type CreationRequest =
  | { readonly kind: "agent"; readonly payload: AgentCreationPayload }
  | { readonly kind: "skill"; readonly payload: SkillCreationPayload }
  | { readonly kind: "rule"; readonly payload: RuleCreationPayload }
  | { readonly kind: "knowledge"; readonly payload: KnowledgeCreationPayload }
  | { readonly kind: "client"; readonly payload: ClientCreationPayload }
  | { readonly kind: "project"; readonly payload: ProjectCreationPayload }
  | { readonly kind: "template"; readonly payload: TemplateCreationPayload };

export interface CreationOptions {
  /** Raíz del Workspace a usar al resolver el recurso (delegado tal cual a cada manager). */
  readonly root?: string;
  /** Si es `true`, nunca se escribe nada: solo se valida, resuelve y previsualiza. */
  readonly dryRun?: boolean;
  /** Si hay conflicto de id/slug, intenta automáticamente ids alternativos en vez de fallar. */
  readonly allowAlternativeId?: boolean;
  /** Identificador de la operación, para poder cancelarla o consultarla más tarde. Se genera uno si se omite. */
  readonly operationId?: string;
}

export interface CreationConflict {
  readonly field: string;
  readonly message: string;
  readonly suggestions?: readonly string[];
}

export interface CreationWarning {
  readonly field: string;
  readonly message: string;
}

/** Petición de creación compuesta: varios recursos relacionados, ejecutados en el orden indicado. */
export interface StructureCreationRequest {
  readonly items: readonly CreationRequest[];
}
