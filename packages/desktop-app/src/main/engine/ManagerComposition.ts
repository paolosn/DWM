import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import type { Logger } from "@dwm/logger";
import type { ApplicationContextOptions } from "@dwm/application-api";
import { EventBus } from "@dwm/event-bus";
import { ConfigManager } from "@dwm/config";
import { WorkspaceManager } from "@dwm/workspace";
import { PortableWorkspaceManager, WorkspacePaths } from "@dwm/portable-workspace";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AgentManager } from "@dwm/agent-manager";
import { SkillManager } from "@dwm/skill-manager";
import { RuleManager } from "@dwm/rule-manager";
import { KnowledgeManager } from "@dwm/knowledge-manager";
import { ClientManager } from "@dwm/client-manager";
import { ProjectManager } from "@dwm/project";
import { EnvironmentManager } from "@dwm/environment-manager";
import { ProfileManager } from "@dwm/profile";
import { PluginManager } from "@dwm/plugin";
import { LocalBackupProvider, BackupManager } from "@dwm/backup";
import { RestoreManager } from "@dwm/restore";
import { VerificationManager } from "@dwm/verification";
import { StatusManager } from "@dwm/status";
import { MigrationManager } from "@dwm/migration";
import { PortablePackageManager } from "@dwm/portable-package-manager";
import { AICreatorManager } from "@dwm/ai-creator-manager";
import { ImportManager } from "@dwm/import-manager";
import { DeliveryManager } from "@dwm/delivery-manager";
import { SecretsManager } from "@dwm/secrets";
import { ConnectionsManager } from "@dwm/connections-manager";
import {
  ProjectProvisioningService,
  ViabilityAnalysisService,
  ContentSyncService,
} from "@dwm/project-provisioning";
import { AIManager } from "@dwm/ai-manager";

export interface ManagerCompositionOptions {
  /** Directorio de datos de la app (`app.getPath("userData")`); aquí viven las carpetas propias de cada manager. */
  readonly dataDir: string;
  /** Directorio desde el que `PortableWorkspaceManager` busca un Workspace portable existente al arrancar. */
  readonly workspaceStartDir: string;
  readonly dwmVersion: string;
  readonly logger?: Logger;
}

export interface ManagerCompositionResult {
  readonly context: ApplicationContextOptions;
  /** `true` si se localizó y registró un Workspace portable existente al arrancar. */
  readonly workspaceLocated: boolean;
}

/**
 * Módulo 34 — Integración final. `EngineBootstrap` (Módulo 32) construía
 * deliberadamente `ApplicationAPI` sin ningún manager conectado: cualquier
 * operación devolvía `APP_DEPENDENCY_UNAVAILABLE` incluso con managers ya
 * implementados y probados (Módulos 1-30). Esta es la conexión real que
 * faltaba: instancia los managers de dominio reales, en el orden que
 * exigen sus propias dependencias, y localiza (sin inventar ni simular)
 * un Workspace portable existente arrancando la búsqueda desde
 * `workspaceStartDir` — si no hay ninguno, los managers de recursos PSN
 * (Agentes/Skills/Reglas/Conocimiento/Clientes) quedan conectados pero
 * devuelven el error real de "Workspace no localizado" hasta que el
 * usuario valide o cree uno (Onboarding / Workspaces, Módulo 33B).
 *
 * No incluye `importManager`→`psnAdapter` como disparador automático de
 * un nuevo escaneo cuando el usuario valida un Workspace distinto desde
 * la UI en caliente: eso exigiría un ciclo de vida de "Workspace activo"
 * más elaborado que no existe todavía en ningún módulo anterior. Documentado
 * como limitación real en LIMITATIONS-v1.0.0.md, no simulado.
 */
/**
 * Módulo 34 — bug de integración real encontrado al escribir la primera
 * prueba de integración con managers reales: `PortableWorkspaceManager
 * .initializeWorkspace()` crea el layout nativo de DWM (`config/`,
 * `profiles/`, `backups/`, ...) pero NUNCA la estructura heredada del
 * antiguo SISTEMA-DE-TRABAJO (`.kilo/agents`, `.kilo/skills`, ...) que
 * `PSNAdapter.scanWorkspace()` necesita para reconocer agentes, skills,
 * reglas, conocimiento y clientes. Sin esto, un Workspace recién creado
 * quedaba "activo" pero con las cinco pantallas de recursos PSN
 * completamente inoperativas. No duplica la lógica de escaneo de
 * `@dwm/psn-adapter` (que sigue siendo la única fuente de verdad para
 * leer/interpretar esos recursos): solo garantiza que las carpetas que
 * el escáner ya sabe reconocer existan antes de escanear.
 */
async function ensurePsnSkeleton(root: string): Promise<void> {
  const directories = [
    path.join(root, ".kilo", "agents"),
    path.join(root, ".kilo", "skills"),
    path.join(root, ".kilo", "rules"),
    path.join(root, "PSN-KNOWLEDGE-GLOBAL"),
    path.join(root, "CLIENTES"),
    path.join(root, "PSN-BASE"),
  ];
  for (const dir of directories) {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Módulo 36 — Connections & MCP Manager necesita una única instancia real
 * de `SecretsManager` (README "Integración del motor": "no crear
 * instancias duplicadas de Secrets Manager"). Hasta este módulo, ningún
 * otro componente del Engine consumía `@dwm/secrets`, así que esta es la
 * primera vez que se resuelve una clave maestra real: se persiste una
 * clave aleatoria de 32 bytes en `<dataDir>/.dwm-master.key` (permisos
 * `0600`, fuera de cualquier carpeta de Workspace/proyecto) la primera
 * vez que arranca el Engine, y se reutiliza en cada arranque posterior.
 * Nunca se registra en logs ni en eventos.
 */
async function resolveMasterKey(dataDir: string): Promise<string> {
  const keyFile = path.join(dataDir, ".dwm-master.key");
  try {
    const existing = await fs.readFile(keyFile, "utf-8");
    const trimmed = existing.trim();
    if (trimmed.length >= 8) return trimmed;
  } catch {
    // No existe todavía: se genera a continuación.
  }
  const generated = randomBytes(32).toString("hex");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(keyFile, generated, { encoding: "utf-8", mode: 0o600 });
  return generated;
}

export async function composeManagers(
  options: ManagerCompositionOptions
): Promise<ManagerCompositionResult> {
  const { dataDir, workspaceStartDir, dwmVersion, logger } = options;
  const base = <T extends object>(extra: T) => ({
    ...(logger ? { logger } : {}),
    eventBus,
    ...extra,
  });

  const eventBus = new EventBus();
  const configManager = new ConfigManager(base({ configDir: path.join(dataDir, "config") }));
  const workspaceManager = new WorkspaceManager(base({}));

  const portableWorkspaceManager = new PortableWorkspaceManager(
    base({ startDir: workspaceStartDir, configManager, workspaceManager })
  );

  const psnAdapter = new PSNAdapter(base({ configManager, workspaceManager }));

  let workspaceLocated = false;
  const locatedRoot =
    await portableWorkspaceManager.locateOrRecoverActiveWorkspace(workspaceStartDir);
  if (locatedRoot) {
    await portableWorkspaceManager.registerActiveWorkspace(locatedRoot);
    await ensurePsnSkeleton(locatedRoot);
    await psnAdapter.scanWorkspace(locatedRoot);
    workspaceLocated = true;
  }

  const agentManager = new AgentManager({ psnAdapter });
  const skillManager = new SkillManager({ psnAdapter });
  const ruleManager = new RuleManager({ psnAdapter });
  const knowledgeManager = new KnowledgeManager({ psnAdapter });
  const clientManager = new ClientManager({ psnAdapter });
  const projectManager = new ProjectManager({ projectsDir: path.join(dataDir, "projects") });

  // kilo-content-integration (Commit 3) — reutiliza tal cual psnAdapter/
  // agentManager/skillManager/ruleManager ya compuestos arriba; ningún
  // motor de sincronización nuevo ni instancia duplicada.
  const contentSyncService = new ContentSyncService({
    psnAdapter,
    agentManager,
    skillManager,
    ruleManager,
  });

  const environmentManager = new EnvironmentManager(base({ configManager, workspaceManager }));
  const profileManager = new ProfileManager(
    base({ profilesDir: path.join(dataDir, "profiles"), configManager, workspaceManager })
  );

  // client-workflow-v2 — reutiliza tal cual clientManager/projectManager/
  // profileManager ya compuestos arriba; no crea instancias duplicadas.
  const projectProvisioningService = new ProjectProvisioningService({
    clientManager,
    projectManager,
    profileManager,
  });

  const localBackupProvider = new LocalBackupProvider(dataDir);
  const backupManager = new BackupManager(
    base({
      catalogDir: path.join(dataDir, "backups"),
      providers: [localBackupProvider],
      configManager,
      workspaceManager,
      profileManager,
      projectManager,
    })
  );
  const restoreManager = new RestoreManager(
    base({
      historyDir: path.join(dataDir, "restore-history"),
      backupManager,
      providers: [localBackupProvider],
      configManager,
      workspaceManager,
      profileManager,
      projectManager,
    })
  );
  const verificationManager = new VerificationManager(
    base({
      historyDir: path.join(dataDir, "verification-history"),
      configManager,
      workspaceManager,
      profileManager,
      projectManager,
      backupManager,
      restoreManager,
    })
  );
  const statusManager = new StatusManager(
    base({
      historyDir: path.join(dataDir, "status-history"),
      configManager,
      workspaceManager,
      profileManager,
      projectManager,
      backupManager,
      restoreManager,
      verificationManager,
    })
  );
  const migrationManager = new MigrationManager(
    base({
      historyDir: path.join(dataDir, "migration-history"),
      backupManager,
      restoreManager,
      dwmVersion,
      configManager,
      workspaceManager,
      profileManager,
      projectManager,
    })
  );
  const pluginManager = new PluginManager(
    base({
      pluginsDir: path.join(dataDir, "plugins"),
      dwmVersion,
      configManager,
      workspaceManager,
      profileManager,
      projectManager,
    })
  );
  const portablePackageManager = new PortablePackageManager(
    base({ psnAdapter, environmentManager, configManager, verificationManager, dwmVersion })
  );
  const aiCreatorManager = new AICreatorManager({
    agentManager,
    skillManager,
    ruleManager,
    knowledgeManager,
    clientManager,
    projectManager,
  });
  const importManager = new ImportManager(
    base({
      historyDir: path.join(dataDir, "import-history"),
      configManager,
      workspaceManager,
      // Sin esto, ImportManager no puede resolver un destino por defecto
      // (IMPORT_DESTINATION_UNRESOLVABLE) cuando la solicitud no indica
      // destinationPath explícito: es la conexión pendiente que el propio
      // Workspace interno (documento v1.0.1 §2) requiere para copiar
      // físicamente dentro de él en lugar de depender de la carpeta
      // origen. `dataDir` es estable (no cambia con qué Workspace de
      // recursos esté activo), así que el destino por defecto queda bajo
      // `<dataDir>/workspace/<nombre>`, listo para `workspace.register`.
      workspacePaths: new WorkspacePaths(dataDir),
      backupManager,
      restoreManager,
      verificationManager,
    })
  );
  // Módulo 35 — reutiliza exactamente la misma instancia de `importManager`
  // ya construida arriba: `DeliveryManager` nunca crea ni necesita un
  // segundo motor de importación, solo delega en él la copia física de
  // cada entrega.
  const deliveryManager = new DeliveryManager(base({ importManager }));

  // Módulo 36 — única instancia de Secrets Manager del Engine (ver
  // `resolveMasterKey`); `ConnectionsManager` la reutiliza, nunca crea la suya.
  const masterKey = await resolveMasterKey(dataDir);
  const secretsManager = new SecretsManager(
    base({ configuration: { secretsDir: path.join(dataDir, "secrets"), masterKey }, configManager })
  );
  const connectionsManager = new ConnectionsManager(base({ secretsManager }));

  // client-workflow-v2 (cierre de limitaciones, item 6) — reutiliza tal
  // cual la misma instancia de SecretsManager de arriba; AIManager nunca
  // retiene una credencial más allá de una única llamada (la resuelve él
  // mismo, vía @dwm/secrets, justo antes de cada petición).
  const aiManager = new AIManager(
    base({
      configuration: {
        timeoutMs: 30_000,
        retry: { maxAttempts: 2, backoff: { baseDelayMs: 500 } },
      },
      secretsManager,
    })
  );
  const viabilityAnalysisService = new ViabilityAnalysisService(aiManager);

  return {
    workspaceLocated,
    context: {
      ...(logger ? { logger } : {}),
      eventBus,
      configManager,
      workspaceManager,
      portableWorkspaceManager,
      importManager,
      deliveryManager,
      connectionsManager,
      projectProvisioningService,
      aiManager,
      viabilityAnalysisService,
      contentSyncService,
      psnAdapter,
      agentManager,
      skillManager,
      ruleManager,
      knowledgeManager,
      clientManager,
      projectManager,
      environmentManager,
      portablePackageManager,
      aiCreatorManager,
      backupManager,
      restoreManager,
      migrationManager,
      verificationManager,
      statusManager,
      profileManager,
      pluginManager,
    },
  };
}
