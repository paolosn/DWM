import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import type { WorkspaceManager } from "@dwm/workspace";
import type { WorkspacePaths } from "@dwm/portable-workspace";
import type { Scheduler, TaskHandle } from "@dwm/scheduler";
import type { VerificationManager } from "@dwm/verification";
import type { StatusProvider } from "@dwm/status";
import { makeStatusReport } from "@dwm/status";
import { NodeSystemInfoProvider, type SystemInfoProvider } from "./SystemInfoProvider.js";
import { NodeProcessRunner, type ProcessRunner } from "./ProcessRunner.js";
import { NodeFileSystemProbe, type FileSystemProbe } from "./FileSystemProbe.js";
import { ToolRegistry } from "./ToolRegistry.js";
import { EnvironmentDetector } from "./EnvironmentDetector.js";
import { EnvironmentRegistry } from "./EnvironmentRegistry.js";
import { EnvironmentValidator } from "./EnvironmentValidator.js";
import { EnvironmentVariables } from "./EnvironmentVariables.js";
import { VersionComparator } from "./VersionComparator.js";
import { buildEnvironmentSummary } from "./EnvironmentSummary.js";
import { BUILTIN_TOOL_DETECTORS } from "./BuiltinToolDetectors.js";
import { normalizePlatform } from "./EnvironmentTypes.js";
import type {
  EnvironmentPlatformInfo,
  EnvironmentRequirement,
  EnvironmentSummary,
  EnvironmentValidationResult,
  InspectOptions,
  ToolFilter,
  ToolResult,
  ToolVersion,
} from "./EnvironmentTypes.js";
import type { ToolDetectionContext, ToolDetectorDefinition } from "./ToolDetector.js";
import { ToolDetector } from "./ToolDetector.js";

export interface EnvironmentManagerOptions {
  readonly systemInfo?: SystemInfoProvider;
  readonly processRunner?: ProcessRunner;
  readonly fileSystem?: FileSystemProbe;
  /** Detectores adicionales a los integrados. Un id duplicado con un detector integrado lanza al construir el manager. */
  readonly detectors?: readonly ToolDetectorDefinition[];
  /** Solo registra los detectores integrados cuyo id aparezca aquí; si se omite, se registran todos. Útil para tests deterministas. */
  readonly includeBuiltinDetectors?: readonly string[];
  readonly defaultTimeoutMs?: number;
  readonly defaultMaxOutputBytes?: number;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly workspacePaths?: WorkspacePaths;
  readonly scheduler?: Scheduler;
  /** Si se indica junto con `scheduler`, refresca la inspección periódicamente mientras el módulo esté activo. */
  readonly refreshIntervalMs?: number;
  readonly verificationManager?: VerificationManager;
}

export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

const REFRESH_TASK_ID = "environment-refresh";

/**
 * Módulo 28 — Environment Manager. Detecta, describe y valida el
 * entorno local donde se ejecuta DWM: sistema operativo, arquitectura,
 * shell, variables autorizadas y un catálogo extensible de
 * herramientas (Git, Node.js, npm, pnpm, Yarn, PHP, Composer, Python,
 * pip, VS Code, Docker, Docker Compose, Ollama, FFmpeg, GitHub CLI).
 * Solo detecta y valida: nunca instala, actualiza, repara, modifica
 * `PATH` ni variables del sistema, ni ejecuta nada destructivo. Toda
 * ejecución de comandos pasa por `ProcessRunner` (argumentos separados,
 * timeout obligatorio, límite de salida, sin shell salvo necesidad
 * documentada) y todo acceso a variables de entorno pasa por
 * `EnvironmentVariables` (catálogo cerrado, nunca variables arbitrarias
 * o sensibles). Implementa `IModule`, integrándose con el resto del
 * Engine únicamente a través de las APIs públicas de `WorkspaceManager`,
 * `WorkspacePaths`, `ConfigManager`, `Logger`, `EventBus`, `Scheduler`
 * y `VerificationManager` — sin depender de Agent Manager, Skill
 * Manager, Rule Manager, Knowledge Manager ni Client Manager.
 */
export class EnvironmentManager implements IModule {
  readonly id = "environment-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly systemInfo: SystemInfoProvider;
  private readonly processRunner: ProcessRunner;
  private readonly fileSystem: FileSystemProbe;
  private readonly manualToolPaths = new Map<string, string>();
  private readonly toolRegistry = new ToolRegistry();
  private readonly environmentDetector = new EnvironmentDetector();
  private readonly toolDetector = new ToolDetector();
  private readonly registry = new EnvironmentRegistry();
  private readonly validator = new EnvironmentValidator();
  private readonly variables: EnvironmentVariables;
  private readonly comparator = new VersionComparator();

  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxOutputBytes: number;

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly workspacePaths?: WorkspacePaths;
  private readonly scheduler?: Scheduler;
  private readonly refreshIntervalMs?: number;
  private readonly verificationManager?: VerificationManager;
  private refreshTaskHandle?: TaskHandle;

  constructor(options: EnvironmentManagerOptions = {}) {
    this.systemInfo = options.systemInfo ?? new NodeSystemInfoProvider();
    this.processRunner = options.processRunner ?? new NodeProcessRunner(this.systemInfo);
    this.fileSystem = options.fileSystem ?? new NodeFileSystemProbe();
    this.variables = new EnvironmentVariables(this.systemInfo);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultMaxOutputBytes = options.defaultMaxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

    const builtins = options.includeBuiltinDetectors
      ? BUILTIN_TOOL_DETECTORS.filter((d) => options.includeBuiltinDetectors!.includes(d.id))
      : BUILTIN_TOOL_DETECTORS;
    for (const definition of builtins) this.toolRegistry.register(definition);
    for (const definition of options.detectors ?? []) this.toolRegistry.register(definition);

    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.workspacePaths) this.workspacePaths = options.workspacePaths;
    if (options.scheduler) this.scheduler = options.scheduler;
    if (options.refreshIntervalMs) this.refreshIntervalMs = options.refreshIntervalMs;
    if (options.verificationManager) this.verificationManager = options.verificationManager;
  }

  // ---------------------------------------------------------------------
  // Sistema y variables
  // ---------------------------------------------------------------------

  getPlatformInfo(): EnvironmentPlatformInfo {
    const nodePlatform = this.systemInfo.nodePlatform();
    const platform = normalizePlatform(nodePlatform);
    const shellVariable = platform === "windows" ? "COMSPEC" : "SHELL";
    const shell = this.variables.get(shellVariable);
    return {
      platform,
      nodePlatform,
      architecture: this.systemInfo.arch(),
      ...(shell ? { shell } : {}),
    };
  }

  getAuthorizedVariable(name: string): string | undefined {
    return this.variables.get(name);
  }

  listAuthorizedVariableNames(): readonly string[] {
    return this.variables.listAuthorizedNames();
  }

  // ---------------------------------------------------------------------
  // Detectores
  // ---------------------------------------------------------------------

  listDetectors(): ToolDetectorDefinition[] {
    return this.toolRegistry.list();
  }

  registerDetector(definition: ToolDetectorDefinition): void {
    this.toolRegistry.register(definition);
    this.registry.invalidate();
  }

  unregisterDetector(id: string): void {
    this.toolRegistry.unregister(id);
    this.registry.invalidate();
  }

  /**
   * Configura manualmente la ruta de instalación de una herramienta
   * (p. ej. "vscode") cuando la detección automática no la localiza —
   * usado por el detector de VS Code (README "rutas configuradas
   * manualmente"). Invalida la caché para que la próxima inspección la
   * tenga en cuenta.
   */
  setManualToolPath(toolId: string, path: string): void {
    this.manualToolPaths.set(toolId, path);
    this.registry.invalidate();
  }

  clearManualToolPath(toolId: string): void {
    this.manualToolPaths.delete(toolId);
    this.registry.invalidate();
  }

  getManualToolPath(toolId: string): string | undefined {
    return this.manualToolPaths.get(toolId);
  }

  // ---------------------------------------------------------------------
  // Detección
  // ---------------------------------------------------------------------

  /** Consulta una única herramienta. Usa la caché si existe y `options.force` no es `true`. */
  async getTool(
    id: string,
    options: { force?: boolean; signal?: AbortSignal } = {}
  ): Promise<ToolResult> {
    const definition = this.toolRegistry.require(id);
    if (!options.force) {
      const cached = this.registry.getTool(id);
      if (cached) return cached;
    }

    const result = await this.toolDetector.detect(
      definition,
      this.detectionContext(options.signal)
    );

    const current = this.registry.get();
    if (current) {
      const tools = current.tools.map((tool) => (tool.id === id ? result : tool));
      this.registry.set(buildEnvironmentSummary(this.getPlatformInfo(), tools, current.durationMs));
    }
    return result;
  }

  /** Ejecuta (o reutiliza de caché) una inspección completa de todas las herramientas registradas. */
  async inspect(options: InspectOptions = {}): Promise<EnvironmentSummary> {
    if (!options.force && this.registry.hasCache()) {
      return this.registry.get()!;
    }

    const start = Date.now();
    const tools = await this.environmentDetector.detectAll(
      this.toolRegistry,
      this.detectionContext(options.signal)
    );
    const summary = buildEnvironmentSummary(this.getPlatformInfo(), tools, Date.now() - start);
    this.registry.set(summary);
    await this.notify(summary);
    await this.afterMutation(summary);
    return summary;
  }

  /** Fuerza una nueva inspección completa, ignorando la caché. */
  async refresh(signal?: AbortSignal): Promise<EnvironmentSummary> {
    return this.inspect({ force: true, ...(signal ? { signal } : {}) });
  }

  invalidateCache(): void {
    this.registry.invalidate();
  }

  async listTools(options: InspectOptions = {}): Promise<readonly ToolResult[]> {
    const summary = await this.inspect(options);
    return summary.tools;
  }

  async filterTools(filter: ToolFilter, options: InspectOptions = {}): Promise<ToolResult[]> {
    const summary = await this.inspect(options);
    return summary.tools.filter((tool) => {
      if (filter.status !== undefined && tool.status !== filter.status) return false;
      if (filter.category !== undefined && tool.category !== filter.category) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------------
  // Validación y versiones
  // ---------------------------------------------------------------------

  async validateRequirements(
    requirements: readonly EnvironmentRequirement[],
    options: InspectOptions = {}
  ): Promise<EnvironmentValidationResult> {
    const summary = await this.inspect(options);
    return this.validator.validate(requirements, summary.tools);
  }

  compareVersions(a: string | ToolVersion, b: string | ToolVersion): -1 | 0 | 1 {
    return this.comparator.compare(a, b);
  }

  async satisfiesMinimumVersion(
    toolId: string,
    minVersion: string,
    options: { force?: boolean; signal?: AbortSignal } = {}
  ): Promise<boolean> {
    const tool = await this.getTool(toolId, options);
    return (
      (tool.status === "available" || tool.status === "available-without-cli") &&
      !!tool.version &&
      this.comparator.satisfiesMinimum(tool.version, minVersion)
    );
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private detectionContext(signal?: AbortSignal): ToolDetectionContext {
    return {
      processRunner: this.processRunner,
      systemInfo: this.systemInfo,
      fileSystem: this.fileSystem,
      platform: normalizePlatform(this.systemInfo.nodePlatform()),
      defaultTimeoutMs: this.defaultTimeoutMs,
      defaultMaxOutputBytes: this.defaultMaxOutputBytes,
      manualToolPaths: this.manualToolPaths,
      ...(signal ? { signal } : {}),
    };
  }

  // ---------------------------------------------------------------------
  // Integraciones
  // ---------------------------------------------------------------------

  listConnectedIntegrations(): string[] {
    const connected: string[] = [];
    if (this.workspacePaths) connected.push("portable-workspace");
    if (this.workspaceManager) connected.push("workspace");
    if (this.configManager) connected.push("config");
    if (this.scheduler) connected.push("scheduler");
    if (this.verificationManager) connected.push("verification");
    return connected;
  }

  toStatusProvider(): StatusProvider {
    return {
      id: "environment-manager",
      getStatus: () => {
        const cached = this.registry.get();
        if (!cached) {
          return makeStatusReport(
            "environment-manager",
            "UNKNOWN",
            "Todavía no se ha ejecutado ninguna inspección del entorno."
          );
        }
        return makeStatusReport(
          "environment-manager",
          "OK",
          "environment-manager responde correctamente.",
          {
            available: cached.availableCount,
            missing: cached.missingCount,
            invalid: cached.invalidCount,
            generatedAt: cached.generatedAt,
          }
        );
      },
    };
  }

  private async afterMutation(summary: EnvironmentSummary): Promise<void> {
    if (this.configManager) {
      await this.configManager.setSection("environment-manager", {
        available: summary.availableCount,
        missing: summary.missingCount,
        invalid: summary.invalidCount,
        unsupported: summary.unsupportedCount,
        generatedAt: summary.generatedAt,
        integrations: this.listConnectedIntegrations(),
      });
    }
    if (this.verificationManager) {
      try {
        await this.verificationManager.verify({ dryRun: true });
      } catch (err) {
        if (this.logger) {
          await this.logger
            .withCorrelationId("environment-manager")
            .warn(
              `environment-manager: la verificación posterior a la inspección reportó un problema: ${err instanceof Error ? err.message : String(err)}`
            );
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("environment-manager", {
        integrations: this.listConnectedIntegrations(),
      });
    }

    if (this.scheduler && this.refreshIntervalMs) {
      this.refreshTaskHandle = this.scheduler.schedule(
        async () => {
          await this.refresh().catch(() => {});
        },
        { id: REFRESH_TASK_ID, intervalMs: this.refreshIntervalMs }
      );
    }

    context.reportStatus(SystemStatus.OK, "environment-manager inicializado");
  }

  /** Apagado limpio: cancela el refresco periódico. No modifica el sistema ni el entorno detectado. */
  async dispose(): Promise<void> {
    this.refreshTaskHandle?.cancel();
  }

  private async notify(summary: EnvironmentSummary): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        "environment.inspected",
        {
          availableCount: summary.availableCount,
          missingCount: summary.missingCount,
          invalidCount: summary.invalidCount,
        },
        { correlationId: "environment-manager" }
      );
    }
    if (this.logger) {
      await this.logger
        .withCorrelationId("environment-manager")
        .info(
          `environment:inspected available=${summary.availableCount} missing=${summary.missingCount} invalid=${summary.invalidCount}`
        );
    }
  }
}
