import type { ProcessRunner } from "./ProcessRunner.js";
import type { SystemInfoProvider } from "./SystemInfoProvider.js";
import { VersionParser } from "./VersionParser.js";
import type { EnvironmentPlatform, ToolCategory, ToolResult } from "./EnvironmentTypes.js";

/** Un comando candidato a probar para localizar una herramienta. El primero que se resuelve en `PATH` gana; los siguientes son alternativas (p. ej. `docker-compose` como alternativa a `docker compose`). */
export interface ToolCommandCandidate {
  readonly command: string;
  readonly versionArgs?: readonly string[];
}

/**
 * Contrato público que debe implementar cualquier detector de
 * herramienta, propio del módulo o añadido por un consumidor vía
 * `EnvironmentManager.registerDetector()`. No requiere heredar de
 * ninguna clase: es un objeto de datos plano más, opcionalmente, una
 * función pura `parseVersion`.
 */
export interface ToolDetectorDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: ToolCategory;
  readonly candidates: readonly ToolCommandCandidate[];
  /** Timeout específico de esta herramienta; si se omite, se usa el timeout por defecto del `EnvironmentManager`. */
  readonly timeoutMs?: number;
  /** Plataformas en las que tiene sentido intentar detectar esta herramienta. Si se omite, se prueba en todas. */
  readonly platforms?: readonly EnvironmentPlatform[];
  /** Estrategia de versión personalizada: función pura que recibe stdout/stderr ya capturados (nunca ejecuta nada) y devuelve el fragmento de versión, o `undefined` si no lo encuentra. Si se omite, se usa `VersionParser` sobre la salida combinada. */
  readonly parseVersion?: (stdout: string, stderr: string) => string | undefined;
}

export interface ToolDetectionContext {
  readonly processRunner: ProcessRunner;
  readonly systemInfo: SystemInfoProvider;
  readonly platform: EnvironmentPlatform;
  readonly defaultTimeoutMs: number;
  readonly defaultMaxOutputBytes: number;
  readonly signal?: AbortSignal;
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "ABORT_ERR")
  );
}

/**
 * Ejecuta un único `ToolDetectorDefinition` contra el sistema real (o
 * simulado, vía `ToolDetectionContext`), produciendo un `ToolResult`.
 * Nunca lanza por un fallo propio de la herramienta detectada — eso se
 * traduce siempre en un `ToolResult` con `status: "invalid"` o
 * `"missing"` — salvo cuando la cancelación (`AbortSignal`) es la
 * causa, en cuyo caso se relanza para que quien orquesta la inspección
 * completa decida cómo tratar la cancelación global.
 */
export class ToolDetector {
  private readonly versionParser = new VersionParser();

  async detect(
    definition: ToolDetectorDefinition,
    context: ToolDetectionContext
  ): Promise<ToolResult> {
    const start = Date.now();
    const base = { id: definition.id, name: definition.name, category: definition.category };

    if (definition.platforms && !definition.platforms.includes(context.platform)) {
      return {
        ...base,
        status: "unsupported",
        reason: "unsupported-platform",
        durationMs: Date.now() - start,
      };
    }

    let foundAnyExecutable = false;
    let lastReason: ToolResult["reason"] = "not-found";
    let lastExecutablePath: string | undefined;
    let lastCommand: string | undefined;
    let lastTruncated: boolean | undefined;
    let lastVersion: ToolResult["version"];

    for (const candidate of definition.candidates) {
      const resolvedPath = await context.processRunner.which(candidate.command, {
        ...(context.signal ? { signal: context.signal } : {}),
      });
      if (!resolvedPath) continue;
      foundAnyExecutable = true;

      try {
        const result = await context.processRunner.run(
          resolvedPath,
          candidate.versionArgs ?? ["--version"],
          {
            timeoutMs: definition.timeoutMs ?? context.defaultTimeoutMs,
            maxOutputBytes: context.defaultMaxOutputBytes,
            ...(context.signal ? { signal: context.signal } : {}),
          }
        );

        if (result.timedOut) {
          lastReason = "timeout";
          lastExecutablePath = resolvedPath;
          lastCommand = candidate.command;
          continue;
        }

        const rawVersion = definition.parseVersion
          ? definition.parseVersion(result.stdout, result.stderr)
          : this.versionParser.parse(`${result.stdout}\n${result.stderr}`)?.raw;
        const version = rawVersion ? this.versionParser.parse(rawVersion) : undefined;

        if (!version) {
          lastReason = result.truncated ? "output-too-large" : "unparsable-version";
          lastExecutablePath = resolvedPath;
          lastCommand = candidate.command;
          lastTruncated = result.truncated;
          continue;
        }

        if (result.exitCode !== 0 && result.exitCode !== null) {
          lastReason = "non-zero-exit";
          lastExecutablePath = resolvedPath;
          lastCommand = candidate.command;
          lastTruncated = result.truncated;
          lastVersion = version;
          continue;
        }

        return {
          ...base,
          status: "available",
          executablePath: resolvedPath,
          command: candidate.command,
          version,
          durationMs: Date.now() - start,
          ...(result.truncated ? { truncatedOutput: true } : {}),
        };
      } catch (err) {
        if (isAbortError(err)) throw err;
        lastReason = "spawn-error";
        lastExecutablePath = resolvedPath;
        lastCommand = candidate.command;
      }
    }

    if (!foundAnyExecutable) {
      return { ...base, status: "missing", reason: "not-found", durationMs: Date.now() - start };
    }

    return {
      ...base,
      status: "invalid",
      reason: lastReason,
      ...(lastExecutablePath ? { executablePath: lastExecutablePath } : {}),
      ...(lastCommand ? { command: lastCommand } : {}),
      ...(lastVersion ? { version: lastVersion } : {}),
      ...(lastTruncated ? { truncatedOutput: true } : {}),
      durationMs: Date.now() - start,
    };
  }
}
