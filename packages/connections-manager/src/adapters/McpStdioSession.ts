import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { ConnectionErrorCode } from "../errors/ConnectionErrorCode.js";
import { createConnectionError } from "../errors/ConnectionError.js";

export interface McpStdioProcessOptions {
  /** Ejecutable a lanzar; nunca se concatena en una shell (README "MCP"). */
  readonly command: string;
  readonly args: readonly string[];
  /** Variables de entorno ya resueltas desde referencias a Secrets; nunca se registran. */
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

const MAX_OUTPUT_BYTES = 1_000_000;

/**
 * Cliente mínimo, real, del transporte stdio de MCP: cada mensaje
 * JSON-RPC 2.0 se envía y recibe como una línea de texto delimitada por
 * `\n` (framing estándar de stdio en MCP). Nunca ejecuta el comando a
 * través de una shell ni acepta una cadena concatenada: `command` y
 * `args` se pasan siempre como argv separado a `child_process.spawn`.
 * Aplica límite de salida, timeout por petición y limpieza garantizada
 * del proceso al cerrar o cancelar.
 */
export class McpStdioSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private outputBytes = 0;
  private nextId = 1;
  private closed = false;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();

  constructor(private readonly options: McpStdioProcessOptions) {}

  start(): void {
    if (this.child) return;
    try {
      this.child = spawn(this.options.command, [...this.options.args], {
        cwd: this.options.cwd,
        env: { ...process.env, ...(this.options.env ?? {}) },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_MCP_PROCESS_FAILED,
        message: "No se pudo iniciar el proceso del servidor MCP.",
        origin: "mcp",
        recoverable: true,
        cause: err,
      });
    }
    this.child.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    this.child.on("error", (err) =>
      this.failAllPending(err instanceof Error ? err : new Error(String(err)))
    );
    this.child.on("exit", () =>
      this.failAllPending(new Error("El proceso del servidor MCP finalizó."))
    );
  }

  private onData(chunk: Buffer): void {
    this.outputBytes += chunk.length;
    if (this.outputBytes > MAX_OUTPUT_BYTES) {
      const err = new Error("Límite de salida del proceso MCP excedido.");
      this.kill();
      this.failAllPending(err);
      return;
    }
    this.buffer += chunk.toString("utf-8");
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) continue;
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let message: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      message = JSON.parse(line) as typeof message;
    } catch {
      // Línea no-JSON (log del propio servidor por stdout): se ignora, nunca se registra tal cual.
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message ?? "Error JSON-RPC del servidor MCP."));
    } else {
      pending.resolve(message.result);
    }
  }

  async request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (!this.child) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_MCP_PROCESS_FAILED,
        message: "La sesión MCP no está iniciada.",
        origin: "mcp",
        recoverable: true,
      });
    }
    const id = this.nextId++;
    const payload = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tiempo de espera agotado esperando respuesta de "${method}".`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.child!.stdin.write(payload, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  private failAllPending(err: Error): void {
    for (const [, pending] of this.pending) pending.reject(err);
    this.pending.clear();
  }

  kill(): void {
    if (this.closed) return;
    this.closed = true;
    this.failAllPending(new Error("Sesión MCP cerrada."));
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
  }

  get isRunning(): boolean {
    return this.child !== null && !this.closed;
  }
}
