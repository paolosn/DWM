/**
 * Catálogo cerrado de sujetos (herramientas/servicios) para los que esta
 * infraestructura está preparada. No implica lógica alguna específica de
 * cada herramienta: es solo el vocabulario declarativo que un
 * `BaseAdapter` concreto (aún no implementado) usará para identificarse.
 */
export enum AdapterSubject {
  VSCODE = "vscode",
  CURSOR = "cursor",
  WINDSURF = "windsurf",
  CLAUDE_CODE = "claude-code",
  GIT = "git",
  OLLAMA = "ollama",
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
}

export function isValidAdapterSubject(value: unknown): value is AdapterSubject {
  return (
    typeof value === "string" && Object.values(AdapterSubject).includes(value as AdapterSubject)
  );
}
