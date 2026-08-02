import { randomUUID } from "node:crypto";
import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus, type DWMCore } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginManager } from "@dwm/plugin";
import type { BackupManager } from "@dwm/backup";
import type { RestoreManager } from "@dwm/restore";
import type { MigrationManager } from "@dwm/migration";
import { ALL_VERIFICATION_CATEGORIES, type VerificationCategory } from "./VerificationCategory.js";
import type { CheckResult } from "./CheckResult.js";
import { VerificationRegistry, type VerificationFilter } from "./VerificationRegistry.js";
import { VerificationStore, type PersistedVerification } from "./VerificationStore.js";
import { VerificationValidator } from "./VerificationValidator.js";
import type { VerificationRequest } from "./VerificationRequest.js";
import type { VerificationResult } from "./VerificationResult.js";
import type { VerificationDescriptor } from "./VerificationDescriptor.js";
import { isTerminalVerificationState } from "./VerificationState.js";
import { VerificationErrorCode } from "./errors/VerificationErrorCode.js";
import { VerificationError, createVerificationError } from "./errors/VerificationError.js";
import * as checkers from "./VerificationCheckers.js";

export interface VerificationManagerOptions {
  readonly historyDir: string;
  readonly core?: DWMCore;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  readonly projectManager?: ProjectManager;
  readonly pluginManager?: PluginManager;
  readonly backupManager?: BackupManager;
  readonly restoreManager?: RestoreManager;
  readonly migrationManager?: MigrationManager;
}

type VerificationEventPhase =
  "requested" | "started" | "completed" | "completed.with_warnings" | "failed";

const LOCK_KEY = "verification";

/**
 * Sistema de verificación integral del sistema DWM. Implementa `IModule`
 * (ADR-002 §3): se registra en el Core mediante `registerModule`, recibe
 * únicamente el `ModuleContext` mínimo. Nunca ejecuta lógica de negocio
 * propia sobre los recursos: cada comprobación delega exclusivamente en
 * las APIs públicas ya existentes de los módulos anteriores (incluida la
 * propia verificación de integridad de `@dwm/backup`), sin duplicarlas.
 */
export class VerificationManager implements IModule {
  readonly id = "verification-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new VerificationRegistry();
  private readonly store: VerificationStore;
  private readonly validator = new VerificationValidator();
  private readonly busy = new Set<string>();

  private readonly core?: DWMCore;
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;
  private readonly secretsManager?: SecretsManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly profileManager?: ProfileManager;
  private readonly projectManager?: ProjectManager;
  private readonly pluginManager?: PluginManager;
  private readonly backupManager?: BackupManager;
  private readonly restoreManager?: RestoreManager;
  private readonly migrationManager?: MigrationManager;

  constructor(options: VerificationManagerOptions) {
    if (!options || typeof options.historyDir !== "string" || options.historyDir.length === 0) {
      throw createVerificationError({
        code: VerificationErrorCode.VERIFICATION_INVALID_REQUEST,
        message:
          "VerificationManagerOptions.historyDir es obligatorio y debe ser una cadena no vacía.",
        origin: "request",
        recoverable: false,
      });
    }
    this.store = new VerificationStore(options.historyDir);
    if (options.core) this.core = options.core;
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
    if (options.secretsManager) this.secretsManager = options.secretsManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.profileManager) this.profileManager = options.profileManager;
    if (options.projectManager) this.projectManager = options.projectManager;
    if (options.pluginManager) this.pluginManager = options.pluginManager;
    if (options.backupManager) this.backupManager = options.backupManager;
    if (options.restoreManager) this.restoreManager = options.restoreManager;
    if (options.migrationManager) this.migrationManager = options.migrationManager;
  }

  // ---------------------------------------------------------------------
  // Verificación
  // ---------------------------------------------------------------------

  async verify(request: VerificationRequest = {}): Promise<VerificationResult> {
    this.validator.assertValidRequest(request);
    const categories = request.categories ?? ALL_VERIFICATION_CATEGORIES;

    return this.withLock(async () => {
      const verificationId = randomUUID();
      this.registry.register(verificationId, request, categories);
      await this.notify("requested", verificationId);

      try {
        this.registry.setState(verificationId, "running");
        await this.notify("started", verificationId);

        const checks: CheckResult[] = [];
        for (const category of categories) {
          checks.push(...(await this.runCategory(category, request.dryRun ?? false)));
        }

        this.registry.setChecks(verificationId, checks);
        const state = checks.some((c) => c.status === "fail")
          ? "failed"
          : checks.some((c) => c.status === "warning")
            ? "completed_with_warnings"
            : "completed";
        this.registry.setState(verificationId, state);
        this.registry.setCompletedAt(verificationId, new Date().toISOString());
        await this.persist(verificationId);
        await this.notify(
          state === "completed_with_warnings" ? "completed.with_warnings" : state,
          verificationId
        );

        return this.toResult(verificationId);
      } catch (err) {
        const wrapped = VerificationError.wrap(err, {
          code: VerificationErrorCode.VERIFICATION_CHECK_FAILED,
          origin: "check",
          recoverable: true,
        });
        const record = this.registry.get(verificationId);
        if (record && !isTerminalVerificationState(record.state)) {
          this.trySetState(verificationId, "failed");
          await this.persist(verificationId).catch(() => {});
          await this.notify("failed", verificationId);
        }
        throw wrapped;
      }
    });
  }

  private async runCategory(
    category: VerificationCategory,
    dryRun: boolean
  ): Promise<CheckResult[]> {
    switch (category) {
      case "projects":
        return checkers.checkProjects(this.projectManager);
      case "workspaces":
        return checkers.checkWorkspaces(this.workspaceManager);
      case "profiles":
        return checkers.checkProfiles(this.profileManager);
      case "config":
        return checkers.checkConfig(this.configManager);
      case "secrets":
        return checkers.checkSecrets(this.secretsManager);
      case "plugins":
        return checkers.checkPlugins(this.pluginManager);
      case "backups":
        return checkers.checkBackups(this.backupManager);
      case "restores":
        return checkers.checkRestores(this.restoreManager);
      case "migrations":
        return checkers.checkMigrations(this.migrationManager);
      case "dependencies":
        return checkers.checkDependencies(this.core);
      case "compatibility":
        return checkers.checkCompatibility(this.core);
      case "integrity":
        return checkers.checkIntegrity(this.backupManager, dryRun);
      case "consistency":
        return checkers.checkConsistency(
          this.backupManager,
          this.restoreManager,
          this.migrationManager
        );
      default:
        return [];
    }
  }

  // ---------------------------------------------------------------------
  // Consulta e historial
  // ---------------------------------------------------------------------

  getVerification(id: string): VerificationDescriptor | undefined {
    return this.registry.has(id) ? this.registry.toDescriptor(id) : undefined;
  }

  listVerifications(): string[] {
    return this.registry.list();
  }

  filterVerifications(criteria: VerificationFilter): string[] {
    return this.registry.filter(criteria);
  }

  async loadFromPersistence(): Promise<string[]> {
    const ids = await this.store.listIds();
    const restored: string[] = [];
    for (const id of ids) {
      if (this.registry.has(id)) continue;
      const persisted = await this.store.read(id);
      if (!persisted) continue;
      this.registry.register(id, persisted.request, persisted.categories);
      const record = this.registry.require(id);
      record.state = persisted.state;
      record.checks = [...persisted.checks];
      record.summary = persisted.summary;
      if (persisted.completedAt) record.completedAt = persisted.completedAt;
      restored.push(id);
    }
    return restored;
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("verification-manager", {
        verifications: this.registry.list(),
      });
    }

    context.reportStatus(SystemStatus.OK, "verification-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private trySetState(id: string, state: Parameters<VerificationRegistry["setState"]>[1]): void {
    try {
      this.registry.setState(id, state);
    } catch {
      // Se ignora: la transición ya pudo haberse aplicado por otra vía.
    }
  }

  private toResult(verificationId: string): VerificationResult {
    const record = this.registry.require(verificationId);
    return {
      verificationId,
      state: record.state,
      dryRun: record.request.dryRun ?? false,
      categories: record.categories,
      checks: record.checks,
      summary: record.summary,
    };
  }

  private async persist(id: string): Promise<void> {
    const record = this.registry.require(id);
    const persisted: PersistedVerification = {
      verificationId: record.verificationId,
      request: record.request,
      createdAt: record.createdAt,
      state: record.state,
      categories: record.categories,
      checks: record.checks,
      summary: record.summary,
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
    };
    await this.store.write(persisted);
  }

  private async notify(phase: VerificationEventPhase, correlationId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `verification.${phase}`,
        { verificationId: correlationId },
        { correlationId }
      );
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(correlationId);
      if (phase === "failed") {
        await logger.error(`verification:${phase} ${correlationId}`);
      } else {
        await logger.info(`verification:${phase} ${correlationId}`);
      }
    }
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy.has(LOCK_KEY)) {
      throw createVerificationError({
        code: VerificationErrorCode.VERIFICATION_OPERATION_CONFLICT,
        message: "Ya hay una verificación en curso.",
        origin: "concurrency",
        recoverable: true,
      });
    }
    this.busy.add(LOCK_KEY);
    try {
      return await fn();
    } finally {
      this.busy.delete(LOCK_KEY);
    }
  }
}
