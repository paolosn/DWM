import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import { APPLICATION_API_VERSION, ALL_APPLICATION_CAPABILITIES } from "./ApplicationTypes.js";
import type { ApplicationRequest } from "./ApplicationRequest.js";
import type { ApplicationResponse } from "./ApplicationResponse.js";
import { ApplicationContext, type ApplicationContextOptions } from "./ApplicationContext.js";
import { ApplicationRegistry } from "./ApplicationRegistry.js";
import { ApplicationOperationRegistry } from "./ApplicationOperationRegistry.js";
import { ApplicationPermissions } from "./ApplicationPermissions.js";
import { ApplicationValidator } from "./ApplicationValidator.js";
import { ApplicationEvents } from "./ApplicationEvents.js";
import { ApplicationRouter } from "./ApplicationRouter.js";
import type { ApplicationOperationSnapshot } from "./ApplicationOperation.js";
import { createApplicationError } from "./errors/ApplicationError.js";
import { ApplicationErrorCode } from "./errors/ApplicationErrorCode.js";

import { WorkspaceController } from "./controllers/WorkspaceController.js";
import { ImportController } from "./controllers/ImportController.js";
import { AgentController } from "./controllers/AgentController.js";
import { SkillController } from "./controllers/SkillController.js";
import { RuleController } from "./controllers/RuleController.js";
import { KnowledgeController } from "./controllers/KnowledgeController.js";
import { ClientController } from "./controllers/ClientController.js";
import { ProjectController } from "./controllers/ProjectController.js";
import { EnvironmentController } from "./controllers/EnvironmentController.js";
import { PortablePackageController } from "./controllers/PortablePackageController.js";
import { AICreatorController } from "./controllers/AICreatorController.js";
import { BackupController } from "./controllers/BackupController.js";
import { RestoreController } from "./controllers/RestoreController.js";
import { VerificationController } from "./controllers/VerificationController.js";
import { StatusController } from "./controllers/StatusController.js";
import { ConfigController } from "./controllers/ConfigController.js";
import { ProfileController } from "./controllers/ProfileController.js";
import { PluginController } from "./controllers/PluginController.js";
import { DeliveryController } from "./controllers/DeliveryController.js";
import { ConnectionsController } from "./controllers/ConnectionsController.js";
import { ProvisioningController } from "./controllers/ProvisioningController.js";
import { ContentSyncController } from "./controllers/ContentSyncController.js";
import { ContentGenerationController } from "./controllers/ContentGenerationController.js";

export interface ApplicationAPIOptions extends ApplicationContextOptions {
  readonly logger?: Logger;
}

export interface ApplicationVersionInfo {
  readonly apiVersion: string;
  readonly minCompatibleVersion: string;
  readonly capabilities: readonly string[];
  readonly operations: readonly string[];
}

/**
 * Módulo 31 — Application API. Capa pública de aplicación que conecta el
 * backend de DWM con futuras interfaces (Desktop App, CLI, otros
 * consumidores autorizados) sin exponer nunca los managers concretos ni el
 * sistema de archivos directamente. Punto de entrada único: `execute()`.
 */
export class ApplicationAPI implements IModule {
  readonly id = "application-api";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly context: ApplicationContext;
  private readonly registry: ApplicationRegistry;
  private readonly operations: ApplicationOperationRegistry;
  private readonly permissions: ApplicationPermissions;
  private readonly validator: ApplicationValidator;
  private readonly events: ApplicationEvents;
  private readonly router: ApplicationRouter;
  private readonly logger?: Logger;

  constructor(options: ApplicationAPIOptions = {}) {
    if (options.logger) this.logger = options.logger;
    this.context = new ApplicationContext(options);
    this.registry = new ApplicationRegistry();
    this.operations = new ApplicationOperationRegistry();
    this.permissions = new ApplicationPermissions();
    this.validator = new ApplicationValidator();
    this.events = new ApplicationEvents(this.context.eventBus);

    this.registerControllers();
    this.registry.registerAll(this.operations, this.permissions);

    this.router = new ApplicationRouter({
      operations: this.operations,
      permissions: this.permissions,
      context: this.context,
      validator: this.validator,
      events: this.events,
    });
  }

  private registerControllers(): void {
    this.registry.add(new WorkspaceController(this.context));
    this.registry.add(new ImportController(this.context));
    this.registry.add(new AgentController(this.context));
    this.registry.add(new SkillController(this.context));
    this.registry.add(new RuleController(this.context));
    this.registry.add(new KnowledgeController(this.context));
    this.registry.add(new ClientController(this.context));
    this.registry.add(new ProjectController(this.context));
    this.registry.add(new EnvironmentController(this.context));
    this.registry.add(new PortablePackageController(this.context));
    this.registry.add(new AICreatorController(this.context));
    this.registry.add(new BackupController(this.context));
    this.registry.add(new RestoreController(this.context));
    this.registry.add(new VerificationController(this.context));
    this.registry.add(new StatusController(this.context));
    this.registry.add(new ConfigController(this.context));
    this.registry.add(new ProfileController(this.context));
    this.registry.add(new PluginController(this.context));
    this.registry.add(new DeliveryController(this.context));
    this.registry.add(new ConnectionsController(this.context));
    this.registry.add(new ProvisioningController(this.context));
    this.registry.add(new ContentSyncController(this.context));
    this.registry.add(new ContentGenerationController(this.context));
  }

  // ---------------------------------------------------------------------
  // API pública principal
  // ---------------------------------------------------------------------

  /** Único punto de entrada para ejecutar una operación de la Application API. */
  async execute(request: ApplicationRequest): Promise<ApplicationResponse> {
    return this.router.dispatch(request);
  }

  getVersion(): ApplicationVersionInfo {
    return {
      apiVersion: APPLICATION_API_VERSION,
      minCompatibleVersion: APPLICATION_API_VERSION,
      capabilities: [...ALL_APPLICATION_CAPABILITIES],
      operations: this.operations.list().map((def) => def.name),
    };
  }

  listResources(): readonly string[] {
    return this.registry.listResources();
  }

  // -----------------------------------------------------------------------
  // Progreso y operaciones largas
  // -----------------------------------------------------------------------

  getOperation(operationId: string): ApplicationOperationSnapshot {
    return this.operations.requireSnapshot(operationId);
  }

  listOperations(): readonly ApplicationOperationSnapshot[] {
    return this.operations.listSnapshots();
  }

  cancelOperation(operationId: string): void {
    this.operations.cancel(operationId);
  }

  cleanupFinishedOperations(): number {
    return this.operations.cleanupFinished();
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();
    if (this.context.configManager) {
      await this.context.configManager.setSection("application-api", {
        apiVersion: APPLICATION_API_VERSION,
        integrations: this.context.listConnectedIntegrations(),
        operations: this.operations.list().length,
      });
    }
    context.reportStatus(SystemStatus.OK, "application-api inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar; las operaciones en
    // curso quedan en memoria hasta que finalicen o se cancelen
    // explícitamente por quien las inició.
  }

  /** Utilidad interna: fuerza un error de dependencia ausente con forma normalizada. */
  static missingDependencyError(dependency: string): never {
    throw createApplicationError({
      code: ApplicationErrorCode.APP_DEPENDENCY_UNAVAILABLE,
      message: `La dependencia "${dependency}" no está disponible en este contexto de la Application API.`,
      origin: "dependency",
      category: "unavailable",
      retryable: false,
      recoverable: true,
    });
  }
}
