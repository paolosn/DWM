import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import type { WorkspaceManager } from "@dwm/workspace";
import type { PortableWorkspaceManager } from "@dwm/portable-workspace";
import type { ImportManager } from "@dwm/import-manager";
import type { DeliveryManager } from "@dwm/delivery-manager";
import type { PSNAdapter } from "@dwm/psn-adapter";
import type { AgentManager } from "@dwm/agent-manager";
import type { SkillManager } from "@dwm/skill-manager";
import type { RuleManager } from "@dwm/rule-manager";
import type { KnowledgeManager } from "@dwm/knowledge-manager";
import type { ClientManager } from "@dwm/client-manager";
import type { RequirementManager } from "@dwm/requirement-manager";
import type { ProjectManager } from "@dwm/project";
import type { EnvironmentManager } from "@dwm/environment-manager";
import type { PortablePackageManager } from "@dwm/portable-package-manager";
import type { AICreatorManager } from "@dwm/ai-creator-manager";
import type { BackupManager } from "@dwm/backup";
import type { RestoreManager } from "@dwm/restore";
import type { MigrationManager } from "@dwm/migration";
import type { VerificationManager } from "@dwm/verification";
import type { StatusManager } from "@dwm/status";
import type { ProfileManager } from "@dwm/profile";
import type { PluginManager } from "@dwm/plugin";
import type { ConnectionsManager } from "@dwm/connections-manager";
import type {
  ProjectProvisioningService,
  ViabilityAnalysisService,
  ContentSyncService,
  ContentGenerationService,
  ProfileSyncService,
} from "@dwm/project-provisioning";
import type { AIManager } from "@dwm/ai-manager";
import type { SecretsManager } from "@dwm/secrets";

/**
 * Referencias, todas opcionales, a las APIs públicas de los managers ya
 * existentes que la Application API puede orquestar. Ninguna se crea aquí:
 * las inyecta quien construya `ApplicationAPI` (típicamente el proceso de
 * arranque del Core). Un controlador cuyo manager no esté presente debe
 * fallar con `APP_DEPENDENCY_UNAVAILABLE`, nunca intentar acceder al
 * sistema de archivos u otro recurso directamente.
 */
export interface ApplicationContextOptions {
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly portableWorkspaceManager?: PortableWorkspaceManager;
  readonly importManager?: ImportManager;
  readonly deliveryManager?: DeliveryManager;
  readonly psnAdapter?: PSNAdapter;
  readonly agentManager?: AgentManager;
  readonly skillManager?: SkillManager;
  readonly ruleManager?: RuleManager;
  readonly knowledgeManager?: KnowledgeManager;
  readonly clientManager?: ClientManager;
  readonly requirementManager?: RequirementManager;
  readonly projectManager?: ProjectManager;
  readonly environmentManager?: EnvironmentManager;
  readonly portablePackageManager?: PortablePackageManager;
  readonly aiCreatorManager?: AICreatorManager;
  readonly backupManager?: BackupManager;
  readonly restoreManager?: RestoreManager;
  readonly migrationManager?: MigrationManager;
  readonly verificationManager?: VerificationManager;
  readonly statusManager?: StatusManager;
  readonly profileManager?: ProfileManager;
  readonly pluginManager?: PluginManager;
  readonly connectionsManager?: ConnectionsManager;
  readonly projectProvisioningService?: ProjectProvisioningService;
  readonly aiManager?: AIManager;
  readonly secretsManager?: SecretsManager;
  readonly viabilityAnalysisService?: ViabilityAnalysisService;
  readonly contentSyncService?: ContentSyncService;
  readonly contentGenerationService?: ContentGenerationService;
  readonly profileSyncService?: ProfileSyncService;
}

export class ApplicationContext {
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly portableWorkspaceManager?: PortableWorkspaceManager;
  readonly importManager?: ImportManager;
  readonly deliveryManager?: DeliveryManager;
  readonly psnAdapter?: PSNAdapter;
  readonly agentManager?: AgentManager;
  readonly skillManager?: SkillManager;
  readonly ruleManager?: RuleManager;
  readonly knowledgeManager?: KnowledgeManager;
  readonly clientManager?: ClientManager;
  readonly requirementManager?: RequirementManager;
  readonly projectManager?: ProjectManager;
  readonly environmentManager?: EnvironmentManager;
  readonly portablePackageManager?: PortablePackageManager;
  readonly aiCreatorManager?: AICreatorManager;
  readonly backupManager?: BackupManager;
  readonly restoreManager?: RestoreManager;
  readonly migrationManager?: MigrationManager;
  readonly verificationManager?: VerificationManager;
  readonly statusManager?: StatusManager;
  readonly profileManager?: ProfileManager;
  readonly pluginManager?: PluginManager;
  readonly connectionsManager?: ConnectionsManager;
  readonly projectProvisioningService?: ProjectProvisioningService;
  readonly aiManager?: AIManager;
  readonly secretsManager?: SecretsManager;
  readonly viabilityAnalysisService?: ViabilityAnalysisService;
  readonly contentSyncService?: ContentSyncService;
  readonly contentGenerationService?: ContentGenerationService;
  readonly profileSyncService?: ProfileSyncService;

  constructor(options: ApplicationContextOptions = {}) {
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.portableWorkspaceManager) {
      this.portableWorkspaceManager = options.portableWorkspaceManager;
    }
    if (options.importManager) this.importManager = options.importManager;
    if (options.deliveryManager) this.deliveryManager = options.deliveryManager;
    if (options.psnAdapter) this.psnAdapter = options.psnAdapter;
    if (options.agentManager) this.agentManager = options.agentManager;
    if (options.skillManager) this.skillManager = options.skillManager;
    if (options.ruleManager) this.ruleManager = options.ruleManager;
    if (options.knowledgeManager) this.knowledgeManager = options.knowledgeManager;
    if (options.clientManager) this.clientManager = options.clientManager;
    if (options.requirementManager) this.requirementManager = options.requirementManager;
    if (options.projectManager) this.projectManager = options.projectManager;
    if (options.environmentManager) this.environmentManager = options.environmentManager;
    if (options.portablePackageManager) {
      this.portablePackageManager = options.portablePackageManager;
    }
    if (options.aiCreatorManager) this.aiCreatorManager = options.aiCreatorManager;
    if (options.backupManager) this.backupManager = options.backupManager;
    if (options.restoreManager) this.restoreManager = options.restoreManager;
    if (options.migrationManager) this.migrationManager = options.migrationManager;
    if (options.verificationManager) this.verificationManager = options.verificationManager;
    if (options.statusManager) this.statusManager = options.statusManager;
    if (options.profileManager) this.profileManager = options.profileManager;
    if (options.pluginManager) this.pluginManager = options.pluginManager;
    if (options.connectionsManager) this.connectionsManager = options.connectionsManager;
    if (options.projectProvisioningService)
      this.projectProvisioningService = options.projectProvisioningService;
    if (options.aiManager) this.aiManager = options.aiManager;
    if (options.secretsManager) this.secretsManager = options.secretsManager;
    if (options.viabilityAnalysisService)
      this.viabilityAnalysisService = options.viabilityAnalysisService;
    if (options.contentSyncService) this.contentSyncService = options.contentSyncService;
    if (options.contentGenerationService)
      this.contentGenerationService = options.contentGenerationService;
    if (options.profileSyncService) this.profileSyncService = options.profileSyncService;
  }

  /** Lista de integraciones efectivamente disponibles (para `system.status`). */
  listConnectedIntegrations(): string[] {
    const connected: string[] = [];
    if (this.workspaceManager) connected.push("workspace");
    if (this.portableWorkspaceManager) connected.push("portable-workspace");
    if (this.importManager) connected.push("import-manager");
    if (this.deliveryManager) connected.push("delivery-manager");
    if (this.psnAdapter) connected.push("psn-adapter");
    if (this.agentManager) connected.push("agent-manager");
    if (this.skillManager) connected.push("skill-manager");
    if (this.ruleManager) connected.push("rule-manager");
    if (this.knowledgeManager) connected.push("knowledge-manager");
    if (this.clientManager) connected.push("client-manager");
    if (this.requirementManager) connected.push("requirement-manager");
    if (this.projectManager) connected.push("project");
    if (this.environmentManager) connected.push("environment-manager");
    if (this.portablePackageManager) connected.push("portable-package-manager");
    if (this.aiCreatorManager) connected.push("ai-creator-manager");
    if (this.backupManager) connected.push("backup");
    if (this.restoreManager) connected.push("restore");
    if (this.migrationManager) connected.push("migration");
    if (this.verificationManager) connected.push("verification");
    if (this.statusManager) connected.push("status");
    if (this.configManager) connected.push("config");
    if (this.profileManager) connected.push("profile");
    if (this.pluginManager) connected.push("plugin");
    if (this.connectionsManager) connected.push("connections-manager");
    if (this.projectProvisioningService) connected.push("project-provisioning");
    if (this.aiManager) connected.push("ai-manager");
    if (this.secretsManager) connected.push("secrets-manager");
    if (this.contentSyncService) connected.push("content-sync");
    if (this.contentGenerationService) connected.push("content-generation");
    if (this.profileSyncService) connected.push("profile-sync");
    return connected;
  }
}
