import * as path from "node:path";
import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import type { WorkspaceManager } from "@dwm/workspace";
import type { WorkspacePaths } from "@dwm/portable-workspace";
import type { ImportManager } from "@dwm/import-manager";
import type { VerificationManager } from "@dwm/verification";
import type { StatusProvider } from "@dwm/status";
import { makeStatusReport } from "@dwm/status";
import { PSNScanner } from "./PSNScanner.js";
import { PSNRegistry } from "./PSNRegistry.js";
import type { PSNModel, PSNResource, PSNResourceKind } from "./PSNTypes.js";
import { PSNErrorCode } from "./errors/PSNErrorCode.js";
import { PSNError, createPSNError } from "./errors/PSNError.js";

export interface PSNAdapterOptions {
  readonly scanner?: PSNScanner;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly workspacePaths?: WorkspacePaths;
  readonly importManager?: ImportManager;
  readonly verificationManager?: VerificationManager;
}

type PSNEventPhase = "scan.started" | "scan.completed" | "scan.failed";

/**
 * Módulo 22 — PSN Adapter. No importa nada (eso ya lo hizo
 * `@dwm/import-manager`): interpreta y clasifica el contenido de un
 * Workspace ya importado, reconociendo los elementos del antiguo
 * SISTEMA-DE-TRABAJO (PSN-BASE, .kilo, agents, skills, rules,
 * PSN-KNOWLEDGE-GLOBAL, PROYECTOS, CLIENTES, AUDITORIAS, SEGURIDAD,
 * REDES-SOCIALES, PSN-PANEL) y construyendo un modelo interno consultable
 * por API, sin que el resto de módulos dependan de rutas físicas. Nunca
 * modifica, mueve ni reestructura ficheros, y no crea índices de IA.
 * Implementa `IModule`, integrándose con el resto del Engine únicamente a
 * través de sus APIs públicas.
 */
export class PSNAdapter implements IModule {
  readonly id = "psn-adapter";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new PSNRegistry();
  private readonly scanner: PSNScanner;

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly workspacePaths?: WorkspacePaths;
  private readonly importManager?: ImportManager;
  private readonly verificationManager?: VerificationManager;

  constructor(options: PSNAdapterOptions = {}) {
    this.scanner = options.scanner ?? new PSNScanner();
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.workspacePaths) this.workspacePaths = options.workspacePaths;
    if (options.importManager) this.importManager = options.importManager;
    if (options.verificationManager) this.verificationManager = options.verificationManager;
  }

  // ---------------------------------------------------------------------
  // Interpretación
  // ---------------------------------------------------------------------

  /**
   * Escanea y clasifica `rootPath`. Si se omite, se resuelve por defecto
   * a partir del destino de la última importación de tipo
   * "dwm-workspace" registrada en `@dwm/import-manager` (si hay uno
   * integrado) o, en su defecto, a `WorkspacePaths.sistemaDeTrabajo`.
   */
  async scanWorkspace(rootPath?: string): Promise<PSNModel> {
    const resolvedRoot = rootPath ?? this.resolveDefaultRoot();
    await this.notify("scan.started", resolvedRoot);

    let model: PSNModel;
    try {
      model = await this.scanner.scan(resolvedRoot);
    } catch (err) {
      await this.notify("scan.failed", resolvedRoot);
      throw PSNError.wrap(err, {
        code: PSNErrorCode.PSN_SCAN_FAILED,
        origin: "scan",
        recoverable: true,
        message: `Fallo al interpretar el Workspace en "${resolvedRoot}".`,
      });
    }

    this.registry.set(resolvedRoot, model);

    if (this.configManager) {
      await this.configManager.setSection("psn-adapter", {
        roots: this.registry.listRoots(),
        activeRoot: this.registry.getActiveRoot(),
        integrations: this.listConnectedIntegrations(),
      });
    }

    if (this.verificationManager) {
      try {
        await this.verificationManager.verify({ dryRun: true });
      } catch (err) {
        if (this.logger) {
          await this.logger
            .withCorrelationId(resolvedRoot)
            .warn(
              `psn-adapter: la verificación posterior al escaneo reportó un problema: ${err instanceof Error ? err.message : String(err)}`
            );
        }
      }
    }

    await this.notify("scan.completed", resolvedRoot);
    return model;
  }

  private resolveDefaultRoot(): string {
    const fromImportManager = this.findLatestDwmWorkspaceImportDestination();
    if (fromImportManager) return fromImportManager;

    if (this.workspacePaths) return this.workspacePaths.sistemaDeTrabajo;

    throw createPSNError({
      code: PSNErrorCode.PSN_ROOT_UNRESOLVABLE,
      message:
        "No se indicó una raíz y no se pudo resolver un valor por defecto: integra ImportManager o WorkspacePaths, o indica rootPath explícitamente.",
      origin: "root",
      recoverable: true,
    });
  }

  private findLatestDwmWorkspaceImportDestination(): string | undefined {
    if (!this.importManager) return undefined;

    const candidateIds = [
      ...this.importManager.filterImports({ state: "completed" }),
      ...this.importManager.filterImports({ state: "completed_with_warnings" }),
    ];

    const candidates = candidateIds
      .map((id) => this.importManager!.getImport(id))
      .filter(
        (descriptor): descriptor is NonNullable<typeof descriptor> =>
          !!descriptor &&
          descriptor.request.sourceType === "dwm-workspace" &&
          !!descriptor.destinationPath
      )
      .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));

    return candidates[candidates.length - 1]?.destinationPath;
  }

  // ---------------------------------------------------------------------
  // Consulta del modelo (sin depender de rutas físicas)
  // ---------------------------------------------------------------------

  getResource(kind: PSNResourceKind, root?: string): PSNResource | undefined {
    return this.requireModel(root).resources.find((resource) => resource.kind === kind);
  }

  listResources(root?: string): readonly PSNResource[] {
    return this.requireModel(root).resources;
  }

  hasResource(kind: PSNResourceKind, root?: string): boolean {
    return this.getResource(kind, root) !== undefined;
  }

  /** Resuelve la ruta absoluta de un recurso reconocido, o `undefined` si no se reconoció. */
  getResourcePath(kind: PSNResourceKind, root?: string): string | undefined {
    const resolvedRoot = root ?? this.registry.getActiveRoot();
    if (!resolvedRoot) return undefined;
    const resource = this.getResource(kind, resolvedRoot);
    if (!resource) return undefined;
    return path.join(resolvedRoot, resource.relativePath);
  }

  getModel(root?: string): PSNModel | undefined {
    const resolvedRoot = root ?? this.registry.getActiveRoot();
    if (!resolvedRoot) return undefined;
    return this.registry.get(resolvedRoot);
  }

  listScannedRoots(): string[] {
    return this.registry.listRoots();
  }

  getActiveRoot(): string | undefined {
    return this.registry.getActiveRoot();
  }

  setActiveRoot(root: string): void {
    this.registry.setActiveRoot(root);
  }

  clear(): void {
    this.registry.clear();
  }

  private requireModel(root?: string): PSNModel {
    const resolvedRoot = root ?? this.registry.getActiveRoot();
    if (!resolvedRoot) {
      throw createPSNError({
        code: PSNErrorCode.PSN_MODEL_NOT_FOUND,
        message: "No se ha interpretado ningún Workspace todavía: llama a scanWorkspace() primero.",
        origin: "registry",
        recoverable: true,
      });
    }
    return this.registry.require(resolvedRoot);
  }

  // ---------------------------------------------------------------------
  // Integraciones
  // ---------------------------------------------------------------------

  listConnectedIntegrations(): string[] {
    const connected: string[] = [];
    if (this.workspacePaths) connected.push("portable-workspace");
    if (this.importManager) connected.push("import-manager");
    if (this.workspaceManager) connected.push("workspace");
    if (this.configManager) connected.push("config");
    if (this.verificationManager) connected.push("verification");
    return connected;
  }

  toStatusProvider(): StatusProvider {
    return {
      id: "psn-adapter",
      getStatus: () => {
        const root = this.registry.getActiveRoot();
        if (!root) {
          return makeStatusReport(
            "psn-adapter",
            "UNKNOWN",
            "Todavía no se ha interpretado ningún Workspace."
          );
        }
        const model = this.registry.require(root);
        if (!model.resources.some((resource) => resource.kind === "psn-base")) {
          return makeStatusReport(
            "psn-adapter",
            "WARNING",
            `No se reconoció "PSN-BASE" en "${root}".`,
            { root, recognized: model.resources.length }
          );
        }
        return makeStatusReport("psn-adapter", "OK", "psn-adapter responde correctamente.", {
          root,
          recognized: model.resources.length,
        });
      },
    };
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("psn-adapter", {
        roots: this.registry.listRoots(),
        activeRoot: this.registry.getActiveRoot(),
        integrations: this.listConnectedIntegrations(),
      });
    }

    context.reportStatus(SystemStatus.OK, "psn-adapter inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private async notify(phase: PSNEventPhase, correlationId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`psn.${phase}`, { root: correlationId }, { correlationId });
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(correlationId);
      if (phase === "scan.failed") {
        await logger.error(`psn:${phase} ${correlationId}`);
      } else {
        await logger.info(`psn:${phase} ${correlationId}`);
      }
    }
  }
}
