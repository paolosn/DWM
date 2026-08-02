import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { SystemInfoProvider } from "./SystemInfoProvider.js";

export interface ProcessRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly truncated: boolean;
  readonly durationMs: number;
}

export interface ProcessRunOptions {
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
  readonly cwd?: string;
}

export interface WhichOptions {
  readonly signal?: AbortSignal;
}

/**
 * Abstracción de "ejecutar un comando externo y localizar ejecutables
 * en PATH". Ninguna implementación de esta interfaz debe usar un
 * shell salvo estricta necesidad (ver `NodeProcessRunner`), debe
 * respetar siempre un timeout y un límite de salida, y nunca debe
 * escribir ni modificar nada del sistema — solo leer y observar.
 */
export interface ProcessRunner {
  run(
    command: string,
    args: readonly string[],
    options: ProcessRunOptions
  ): Promise<ProcessRunResult>;
  which(command: string, options?: WhichOptions): Promise<string | undefined>;
}

const WINDOWS_SCRIPT_EXTENSIONS = new Set([".cmd", ".bat"]);

/**
 * Implementación real de `ProcessRunner`, respaldada por
 * `child_process.spawn`. Nunca usa `shell: true` salvo para lanzar un
 * script `.cmd`/`.bat` ya resuelto en Windows (necesidad documentada
 * del propio `CreateProcess` de Windows, no una conveniencia): en ese
 * caso concreto los argumentos siguen pasándose como array separado,
 * nunca concatenados en una cadena.
 */
export class NodeProcessRunner implements ProcessRunner {
  constructor(private readonly systemInfo: SystemInfoProvider) {}

  async run(
    command: string,
    args: readonly string[],
    options: ProcessRunOptions
  ): Promise<ProcessRunResult> {
    const start = Date.now();
    const useShell =
      this.systemInfo.nodePlatform() === "win32" &&
      WINDOWS_SCRIPT_EXTENSIONS.has(path.extname(command).toLowerCase());

    return new Promise((resolve, reject) => {
      let settled = false;
      let stdout = "";
      let stderr = "";
      let truncated = false;
      let timedOut = false;

      const child = spawn(command, args, {
        cwd: options.cwd,
        shell: useShell,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        ...(options.signal ? { signal: options.signal } : {}),
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, options.timeoutMs);
      timer.unref?.();

      const append = (chunk: Buffer, target: "stdout" | "stderr"): void => {
        const remaining =
          options.maxOutputBytes - (target === "stdout" ? stdout.length : stderr.length);
        if (remaining <= 0) {
          truncated = true;
          return;
        }
        const text = chunk.toString("utf-8").slice(0, remaining);
        if (text.length < chunk.length) truncated = true;
        if (target === "stdout") stdout += text;
        else stderr += text;
      };

      child.stdout?.on("data", (chunk: Buffer) => append(chunk, "stdout"));
      child.stderr?.on("data", (chunk: Buffer) => append(chunk, "stderr"));

      child.once("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      child.once("close", (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode,
          signal,
          timedOut,
          truncated,
          durationMs: Date.now() - start,
        });
      });
    });
  }

  /** Localiza un ejecutable recorriendo `PATH`, sin shell, probando las extensiones de `SystemInfoProvider.pathExtensions()` cuando `command` no incluye ya una. */
  async which(command: string, options: WhichOptions = {}): Promise<string | undefined> {
    if (options.signal?.aborted) return undefined;

    // Si ya es una ruta (contiene un separador), se comprueba directamente.
    if (command.includes("/") || command.includes("\\")) {
      return (await this.isExecutableFile(command)) ? command : undefined;
    }

    const pathValue = this.systemInfo.env("PATH") ?? this.systemInfo.env("Path") ?? "";
    const directories = pathValue
      .split(this.systemInfo.pathDelimiter())
      .filter((dir) => dir.length > 0);
    const extensions = this.systemInfo.pathExtensions();
    const candidateNames =
      extensions.length > 0 ? extensions.map((ext) => `${command}${ext}`) : [command];

    for (const dir of directories) {
      if (options.signal?.aborted) return undefined;
      for (const name of candidateNames) {
        const candidate = path.join(dir, name);
        if (await this.isExecutableFile(candidate)) return candidate;
      }
    }
    return undefined;
  }

  private async isExecutableFile(candidate: string): Promise<boolean> {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) return false;
      if (this.systemInfo.nodePlatform() === "win32") return true;
      await fs.access(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
}
