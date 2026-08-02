/**
 * Abstracción de todo lo que este módulo necesita saber sobre el
 * sistema operativo local: nunca se lee `process`/`os` directamente
 * fuera de `NodeSystemInfoProvider`, para poder simular Windows/macOS/
 * Linux en tests deterministas sin depender del SO donde corren.
 */
export interface SystemInfoProvider {
  /** Valor crudo equivalente a `process.platform` ("win32", "darwin", "linux", ...). */
  nodePlatform(): string;
  /** Valor crudo equivalente a `process.arch` ("x64", "arm64", ...). */
  arch(): string;
  /** Lee una variable de entorno por nombre exacto. No implica autorización: eso lo decide `EnvironmentVariables`. */
  env(name: string): string | undefined;
  /** Separador de rutas del `PATH` ("; " en Windows, ":" en POSIX). */
  pathDelimiter(): string;
  /** Extensiones ejecutables a probar al resolver un comando sin extensión (p. ej. `[".exe", ".cmd", ".bat"]` en Windows; `[]` en POSIX). */
  pathExtensions(): readonly string[];
}

/** Implementación real, respaldada por `process`. */
export class NodeSystemInfoProvider implements SystemInfoProvider {
  nodePlatform(): string {
    return process.platform;
  }

  arch(): string {
    return process.arch;
  }

  env(name: string): string | undefined {
    return process.env[name];
  }

  pathDelimiter(): string {
    return process.platform === "win32" ? ";" : ":";
  }

  pathExtensions(): readonly string[] {
    if (process.platform !== "win32") return [];
    const raw = process.env["PATHEXT"];
    if (!raw) return [".exe", ".cmd", ".bat", ".com"];
    return raw.split(";").filter((ext) => ext.length > 0);
  }
}
