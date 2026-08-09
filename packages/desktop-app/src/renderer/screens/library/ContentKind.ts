export type ContentKind = "agent" | "skill" | "rule";

export const CONTENT_KINDS: readonly ContentKind[] = ["agent", "skill", "rule"];

const RESOURCE: Readonly<Record<ContentKind, string>> = {
  agent: "agents",
  skill: "skills",
  rule: "rules",
};

export const KIND_LABEL: Readonly<Record<ContentKind, { singular: string; plural: string }>> = {
  agent: { singular: "Agente", plural: "Agentes" },
  skill: { singular: "Skill", plural: "Skills" },
  rule: { singular: "Regla", plural: "Reglas" },
};

export const KIND_ROUTE_HINT: Readonly<Record<ContentKind, string>> = {
  agent: ".kilo/agents/<id>.md",
  skill: ".kilo/skills/<id>/SKILL.md",
  rule: ".kilo/rules/<id>.md",
};

export const DEFAULT_TEMPLATE: Readonly<Record<ContentKind, string>> = {
  agent: '---\ndescription: ""\nmode: all\ncolor: "#4f46e5"\n---\n\n# Nombre del agente\n',
  skill: '---\nname: ""\ndescription: ""\n---\n\n# Nombre de la skill\n',
  rule: "# Nombre de la regla\n",
};

/** Ruta real (relativa a `root`) del fichero físico de un elemento — usada para "Abrir archivo real". */
export function realFilePath(kind: ContentKind, id: string): string {
  if (kind === "agent") return `.kilo/agents/${id}.md`;
  if (kind === "rule") return `.kilo/rules/${id}.md`;
  return `.kilo/skills/${id}/SKILL.md`;
}

/**
 * client-workflow "kilo-content-integration-completion" (Biblioteca
 * IA) — único punto que traduce un `kind` (`agent`/`skill`/`rule`) al
 * nombre real de cada operación `agents.*`/`skills.*`/`rules.*` ya
 * existente. No inventa ninguna operación nueva: las tres familias ya
 * comparten exactamente la misma forma (list/get/create/update/
 * duplicate/archive/restore/delete con `root?`), lo que permite una
 * única implementación de UI genérica en vez de tres pantallas
 * duplicadas.
 */
export function opName(
  kind: ContentKind,
  action:
    | "list"
    | "get"
    | "get-file-path"
    | "create"
    | "update"
    | "duplicate"
    | "archive"
    | "restore"
    | "delete"
): string {
  return `${RESOURCE[kind]}.${action}`;
}
