import type { SystemInfoProvider } from "../../../src/SystemInfoProvider.js";
import type { FileSystemProbe } from "../../../src/FileSystemProbe.js";
import type {
  ProcessRunner,
  ProcessRunOptions,
  ProcessRunResult,
  WhichOptions,
} from "../../../src/ProcessRunner.js";

export interface FakeSystemInfoOptions {
  readonly nodePlatform?: string;
  readonly arch?: string;
  readonly env?: Record<string, string>;
}

/** `SystemInfoProvider` totalmente simulado y determinista: nunca lee `process` real. */
export class FakeSystemInfoProvider implements SystemInfoProvider {
  private readonly platformValue: string;
  private readonly archValue: string;
  private readonly envValues: Record<string, string>;

  constructor(options: FakeSystemInfoOptions = {}) {
    this.platformValue = options.nodePlatform ?? "linux";
    this.archValue = options.arch ?? "x64";
    this.envValues = options.env ?? {};
  }

  nodePlatform(): string {
    return this.platformValue;
  }

  arch(): string {
    return this.archValue;
  }

  env(name: string): string | undefined {
    return this.envValues[name];
  }

  pathDelimiter(): string {
    return this.platformValue === "win32" ? ";" : ":";
  }

  pathExtensions(): readonly string[] {
    return this.platformValue === "win32" ? [".exe", ".cmd", ".bat"] : [];
  }
}

export interface FakeRunScript {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly timedOut?: boolean;
  readonly truncated?: boolean;
  readonly durationMs?: number;
  readonly throws?: unknown;
  /** Si se indica, `run()` espera esta promesa antes de resolver — para simular procesos lentos y cancelación. */
  readonly delayMs?: number;
}

/**
 * `ProcessRunner` totalmente simulado: `which()` solo "encuentra"
 * comandos explícitamente registrados con `setExecutable`, y `run()`
 * solo produce lo que se le haya programado con `setRunResult` —
 * nunca toca el sistema de ficheros ni lanza procesos reales.
 */
export class FakeProcessRunner implements ProcessRunner {
  private readonly executables = new Map<string, string>();
  private readonly scripts = new Map<string, FakeRunScript>();
  public readonly runCalls: Array<{ command: string; args: readonly string[] }> = [];
  public readonly whichCalls: string[] = [];

  setExecutable(command: string, resolvedPath: string): void {
    this.executables.set(command, resolvedPath);
  }

  setRunResult(resolvedPath: string, script: FakeRunScript): void {
    this.scripts.set(resolvedPath, script);
  }

  async which(command: string, options: WhichOptions = {}): Promise<string | undefined> {
    this.whichCalls.push(command);
    if (options.signal?.aborted) return undefined;
    return this.executables.get(command);
  }

  async run(
    command: string,
    args: readonly string[],
    options: ProcessRunOptions
  ): Promise<ProcessRunResult> {
    this.runCalls.push({ command, args });
    const script = this.scripts.get(command);

    if (options.signal?.aborted) {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    }

    if (script?.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, script.delayMs);
        options.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }

    if (!script) {
      return {
        stdout: "",
        stderr: "",
        exitCode: 1,
        signal: null,
        timedOut: false,
        truncated: false,
        durationMs: 1,
      };
    }
    if (script.throws) throw script.throws;

    return {
      stdout: script.stdout ?? "",
      stderr: script.stderr ?? "",
      exitCode: script.exitCode ?? 0,
      signal: script.signal ?? null,
      timedOut: script.timedOut ?? false,
      truncated: script.truncated ?? false,
      durationMs: script.durationMs ?? 1,
    };
  }
}

/** `FileSystemProbe` totalmente simulado: solo "existen" las rutas registradas explícitamente con `add`. */
export class FakeFileSystemProbe implements FileSystemProbe {
  private readonly existingPaths = new Set<string>();
  public readonly existsCalls: string[] = [];

  add(...paths: readonly string[]): void {
    for (const path of paths) this.existingPaths.add(path);
  }

  async exists(path: string): Promise<boolean> {
    this.existsCalls.push(path);
    return this.existingPaths.has(path);
  }
}
