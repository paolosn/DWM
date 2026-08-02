import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import type { WorkspacePaths } from "@dwm/portable-workspace";
import type { PSNAdapter } from "@dwm/psn-adapter";
import type { EnvironmentManager } from "@dwm/environment-manager";
import type { VerificationManager } from "@dwm/verification";
import type { StatusProvider } from "@dwm/status";
import { makeStatusReport } from "@dwm/status";
import { PackageBuilder, resourceSource } from "./PackageBuilder.js";
import { PackageReader, type PackageZipEntryInfo } from "./PackageReader.js";
import { PackageExtractor } from "./PackageExtractor.js";
import { PackageValidator } from "./PackageValidator.js";
import { resolvePackageSelection, type ResolveSelectionInput } from "./PackageSelection.js";
import type {
  CreatePackageResult,
  DryRunReport,
  ExtractPackageOptions,
  ExtractPackageResult,
  PackageManifest,
  PackageResourceSource,
  PackageSecurityLimits,
  PackageValidationResult,
} from "./PortablePackageTypes.js";

export interface PortablePackageManagerOptions {
  readonly workspacePaths?: WorkspacePaths;
  readonly psnAdapter?: PSNAdapter;
  readonly environmentManager?: EnvironmentManager;
  readonly dwmVersion?: string;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly verificationManager?: VerificationManager;
}

export interface CreatePackageRequest {
  readonly destinationZipPath: string;
  readonly root?: string;
  readonly includeOptionalResources?: readonly string[];
  readonly excludeResourceIds?: readonly string[];
  readonly excludePatterns?: readonly string[];
  readonly includePatterns?: readonly string[];
  readonly includeSecrets?: boolean;
  readonly includeHidden?: boolean;
  readonly packageId?: string;
  readonly workspaceId?: string;
  readonly packageMetadata?: Record<string, string | number | boolean>;
  readonly securityLimits?: Partial<PackageSecurityLimits>;
  readonly signal?: AbortSignal;
  onProgress?(update: {
    phase: string;
    entriesProcessed: number;
    entriesTotal: number;
    currentEntry?: string;
  }): void | Promise<void>;
}

type PackageEventPhase = "package.created" | "package.extracted" | "package.validated";

/**
 * Módulo 29 — Portable Package Manager. Crea, valida, inspecciona y
 * extrae paquetes portables completos de DWM (formato ZIP) para
 * trasladar un Workspace entre equipos sin depender de rutas
 * absolutas. Nunca modifica el Workspace de origen al empaquetar, nunca
 * ejecuta contenido extraído, nunca instala ni configura nada. Resuelve
 * qué recursos existen únicamente a través de `WorkspacePaths` (rutas
 * estándar: `workspace/`, `.dwm/`, `config/`, `profiles/`, `plugins/`,
 * `backups/`, `logs/`, `tools/`, `runtime/`, `secrets/`) y de
 * `PSNAdapter.listResources()` (agentes, skills, reglas, conocimiento,
 * clientes y el resto de recursos PSN detectados) — nunca importando
 * directamente Agent/Skill/Rule/Knowledge/Client Manager, cuyos
 * recursos ya son accesibles por esas dos vías. Implementa `IModule`.
 */
export class PortablePackageManager implements IModule {
  readonly id = "portable-package-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly builder = new PackageBuilder();
  private readonly reader = new PackageReader();
  private readonly extractor: PackageExtractor;
  private readonly validator: PackageValidator;

  private readonly workspacePaths?: WorkspacePaths;
  private readonly psnAdapter?: PSNAdapter;
  private readonly environmentManager?: EnvironmentManager;
  private readonly dwmVersion: string;
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;
  private readonly verificationManager?: VerificationManager;

  constructor(options: PortablePackageManagerOptions = {}) {
    this.extractor = new PackageExtractor(this.reader);
    this.validator = new PackageValidator(this.reader);
    this.dwmVersion = options.dwmVersion ?? "unknown";

    if (options.workspacePaths) this.workspacePaths = options.workspacePaths;
    if (options.psnAdapter) this.psnAdapter = options.psnAdapter;
    if (options.environmentManager) this.environmentManager = options.environmentManager;
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
    if (options.verificationManager) this.verificationManager = options.verificationManager;
  }

  // ---------------------------------------------------------------------
  // Selección de recursos
  // ---------------------------------------------------------------------

  /** Fuentes de recurso disponibles: las rutas estándar de `WorkspacePaths` más los recursos PSN detectados, sin comprobar todavía si existen físicamente. */
  availableResourceSources(root?: string): PackageResourceSource[] {
    const sources: PackageResourceSource[] = [];
    if (this.workspacePaths) {
      sources.push(
        resourceSource("workspace", this.workspacePaths.workspace, true),
        resourceSource("dwm", this.workspacePaths.dwmDir, true),
        resourceSource("config", this.workspacePaths.config, true),
        resourceSource("profiles", this.workspacePaths.profiles, true),
        resourceSource("plugins", this.workspacePaths.plugins, true),
        resourceSource("backups", this.workspacePaths.backups, true),
        resourceSource("logs", this.workspacePaths.logs, true),
        resourceSource("tools", this.workspacePaths.tools, true),
        resourceSource("runtime", this.workspacePaths.runtime, true),
        resourceSource("secrets", this.workspacePaths.secrets, true)
      );
    }
    if (this.psnAdapter) {
      for (const resource of this.psnAdapter.listResources(root)) {
        const absolutePath = this.psnAdapter.getResourcePath(resource.kind, root);
        if (absolutePath) sources.push(resourceSource(`psn-${resource.kind}`, absolutePath, true));
      }
    }
    return sources;
  }

  private buildSelection(request: ResolveSelectionInput & { root?: string }) {
    return resolvePackageSelection({
      ...request,
      availableSources: request.availableSources ?? this.availableResourceSources(request.root),
    });
  }

  private sourcePlatform(): string {
    return this.environmentManager?.getPlatformInfo().platform ?? process.platform;
  }

  // ---------------------------------------------------------------------
  // Creación
  // ---------------------------------------------------------------------

  async createPackage(request: CreatePackageRequest): Promise<CreatePackageResult> {
    const selection = this.buildSelection({
      availableSources: this.availableResourceSources(request.root),
      includeOptionalResources: request.includeOptionalResources,
      excludeResourceIds: request.excludeResourceIds,
      excludePatterns: request.excludePatterns,
      includePatterns: request.includePatterns,
      includeSecrets: request.includeSecrets,
      includeHidden: request.includeHidden,
    });

    const result = await this.builder.build(this.dwmVersion, this.sourcePlatform(), {
      destinationZipPath: request.destinationZipPath,
      selection,
      ...(request.packageId ? { packageId: request.packageId } : {}),
      ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
      ...(request.packageMetadata ? { packageMetadata: request.packageMetadata } : {}),
      ...(request.securityLimits ? { securityLimits: request.securityLimits } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.onProgress ? { onProgress: request.onProgress } : {}),
    });

    await this.notify("package.created", { zipPath: result.zipPath });
    await this.afterMutation();
    return result;
  }

  async dryRunCreatePackage(request: CreatePackageRequest): Promise<DryRunReport> {
    const selection = this.buildSelection({
      availableSources: this.availableResourceSources(request.root),
      includeOptionalResources: request.includeOptionalResources,
      excludeResourceIds: request.excludeResourceIds,
      excludePatterns: request.excludePatterns,
      includePatterns: request.includePatterns,
      includeSecrets: request.includeSecrets,
      includeHidden: request.includeHidden,
    });

    return this.builder.planDryRun(this.dwmVersion, this.sourcePlatform(), {
      destinationZipPath: request.destinationZipPath,
      selection,
      ...(request.securityLimits ? { securityLimits: request.securityLimits } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });
  }

  async estimatePackageSize(
    request: Omit<CreatePackageRequest, "destinationZipPath"> & { destinationZipPath?: string }
  ): Promise<{ estimatedBytes: number; entryCount: number }> {
    const report = await this.dryRunCreatePackage({
      ...request,
      destinationZipPath: request.destinationZipPath ?? "(estimación)",
    });
    return { estimatedBytes: report.estimatedBytes, entryCount: report.included.length };
  }

  // ---------------------------------------------------------------------
  // Lectura e inspección
  // ---------------------------------------------------------------------

  async listPackageContents(zipPath: string): Promise<readonly PackageZipEntryInfo[]> {
    return this.reader.listEntries(zipPath);
  }

  async inspectManifest(zipPath: string): Promise<PackageManifest> {
    return this.reader.readManifest(zipPath);
  }

  async validatePackage(zipPath: string): Promise<PackageValidationResult> {
    const result = await this.validator.validate(zipPath);
    await this.notify("package.validated", { zipPath, valid: result.valid });
    return result;
  }

  // ---------------------------------------------------------------------
  // Extracción
  // ---------------------------------------------------------------------

  async extractPackage(options: ExtractPackageOptions): Promise<ExtractPackageResult> {
    const result = await this.extractor.extract(options);
    await this.notify("package.extracted", { destinationDir: result.destinationDir });
    await this.afterMutation();
    return result;
  }

  async dryRunExtractPackage(options: ExtractPackageOptions): Promise<DryRunReport> {
    return this.extractor.planDryRun(options);
  }

  // ---------------------------------------------------------------------
  // Integraciones
  // ---------------------------------------------------------------------

  listConnectedIntegrations(): string[] {
    const connected: string[] = [];
    if (this.workspacePaths) connected.push("portable-workspace");
    if (this.psnAdapter) connected.push("psn-adapter");
    if (this.environmentManager) connected.push("environment-manager");
    if (this.configManager) connected.push("config");
    if (this.verificationManager) connected.push("verification");
    return connected;
  }

  toStatusProvider(): StatusProvider {
    return {
      id: "portable-package-manager",
      getStatus: () =>
        makeStatusReport(
          "portable-package-manager",
          "OK",
          "portable-package-manager responde correctamente.",
          { integrations: this.listConnectedIntegrations() }
        ),
    };
  }

  private async afterMutation(): Promise<void> {
    if (this.configManager) {
      await this.configManager.setSection("portable-package-manager", {
        integrations: this.listConnectedIntegrations(),
      });
    }
    if (this.verificationManager) {
      try {
        await this.verificationManager.verify({ dryRun: true });
      } catch (err) {
        if (this.logger) {
          await this.logger
            .withCorrelationId("portable-package-manager")
            .warn(
              `portable-package-manager: la verificación posterior a la operación reportó un problema: ${err instanceof Error ? err.message : String(err)}`
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
      await this.configManager.setSection("portable-package-manager", {
        integrations: this.listConnectedIntegrations(),
      });
    }
    context.reportStatus(SystemStatus.OK, "portable-package-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  private async notify(phase: PackageEventPhase, payload: Record<string, unknown>): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(phase, payload, { correlationId: "portable-package-manager" });
    }
    if (this.logger) {
      await this.logger
        .withCorrelationId("portable-package-manager")
        .info(`${phase} ${JSON.stringify(payload)}`);
    }
  }
}
