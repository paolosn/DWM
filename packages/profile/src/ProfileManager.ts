import { randomUUID } from "node:crypto";
import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler, TaskHandle } from "@dwm/scheduler";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { AIManager } from "@dwm/ai-manager";
import type { AdapterManager } from "@dwm/adapters";
import type { ToolingManager } from "@dwm/tooling";
import type { WorkspaceManager } from "@dwm/workspace";
import { Profile } from "./Profile.js";
import { ProfileRegistry } from "./ProfileRegistry.js";
import { ProfileStore, type PersistedProfile } from "./ProfileStore.js";
import { ProfileValidator } from "./ProfileValidator.js";
import {
  createInitialProfileMetadata,
  touchProfileMetadata,
  type ProfileMetadata,
} from "./ProfileMetadata.js";
import type { ProfileConfiguration } from "./ProfileConfiguration.js";
import {
  defaultProfileConfiguration,
  validateProfileConfiguration,
} from "./ProfileConfiguration.js";
import type { ProfileContext } from "./ProfileContext.js";
import { ProfileErrorCode } from "./errors/ProfileErrorCode.js";
import { ProfileError, createProfileError } from "./errors/ProfileError.js";

export interface ProfileManagerOptions {
  readonly profilesDir: string;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
  readonly aiManager?: AIManager;
  readonly adapterManager?: AdapterManager;
  readonly toolingManager?: ToolingManager;
  readonly workspaceManager?: WorkspaceManager;
  /** Si se indica y hay un Scheduler inyectado, se revalida periódicamente el perfil activo. */
  readonly revalidateIntervalMs?: number;
}

type ProfileEventPhase =
  | "created"
  | "updated"
  | "deleted"
  | "cloned"
  | "imported"
  | "exported"
  | "activated"
  | "deactivated"
  | "reloaded"
  | "validation.ok"
  | "validation.error";

const REVALIDATE_TASK_ID = "profile-revalidate";

/**
 * Gestor de perfiles del sistema DWM. Implementa `IModule` (ADR-002 §3): se
 * registra en el Core mediante `registerModule`, recibe únicamente el
 * `ModuleContext` mínimo, y no contiene lógica de ninguna herramienta o
 * sistema operativo. Cada perfil describe un entorno de trabajo completo
 * (workspace asociado, herramientas/adaptadores habilitados, proveedor de
 * IA por defecto, secretos referenciados y preferencias) que
 * posteriormente un Project Manager (aún no implementado) usará para
 * asociar proyectos a un perfil determinado.
 */
export class ProfileManager implements IModule {
  readonly id = "profile-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new ProfileRegistry();
  private readonly store: ProfileStore;
  private readonly validator: ProfileValidator;
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly scheduler?: Scheduler;
  private readonly configManager?: ConfigManager;
  private readonly secretsManager?: SecretsManager;
  private readonly aiManager?: AIManager;
  private readonly adapterManager?: AdapterManager;
  private readonly toolingManager?: ToolingManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly revalidateIntervalMs?: number;
  private revalidateTaskHandle?: TaskHandle;

  constructor(options: ProfileManagerOptions) {
    if (!options || typeof options.profilesDir !== "string" || options.profilesDir.length === 0) {
      throw createProfileError({
        code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION,
        message: "ProfileManagerOptions.profilesDir es obligatorio y debe ser una cadena no vacía.",
        origin: "configuration",
        recoverable: false,
      });
    }
    this.store = new ProfileStore(options.profilesDir);
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.scheduler) this.scheduler = options.scheduler;
    if (options.configManager) this.configManager = options.configManager;
    if (options.secretsManager) this.secretsManager = options.secretsManager;
    if (options.aiManager) this.aiManager = options.aiManager;
    if (options.adapterManager) this.adapterManager = options.adapterManager;
    if (options.toolingManager) this.toolingManager = options.toolingManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.revalidateIntervalMs) this.revalidateIntervalMs = options.revalidateIntervalMs;

    this.validator = new ProfileValidator({
      ...(this.workspaceManager ? { workspaceManager: this.workspaceManager } : {}),
      ...(this.toolingManager ? { toolingManager: this.toolingManager } : {}),
      ...(this.adapterManager ? { adapterManager: this.adapterManager } : {}),
      ...(this.aiManager ? { aiManager: this.aiManager } : {}),
      ...(this.secretsManager ? { secretsManager: this.secretsManager } : {}),
    });
  }

  // ---------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------

  async createProfile(
    name: string,
    description: string,
    configuration: ProfileConfiguration = defaultProfileConfiguration()
  ): Promise<Profile> {
    validateProfileConfiguration(configuration);
    const metadata = createInitialProfileMetadata(randomUUID(), name, description);
    await this.store.write({ metadata, configuration });

    const profile = new Profile(metadata, configuration);
    this.registry.register(profile);
    await this.notify("created", profile.id);
    return profile;
  }

  async deleteProfile(id: string): Promise<void> {
    const profile = this.registry.require(id);
    if (profile.state === "active") {
      await this.deactivateProfile(id);
    }
    await this.store.delete(id);
    this.registry.setState(id, "deleted");
    this.registry.unregister(id);
    await this.notify("deleted", id);
  }

  async updateProfile(
    id: string,
    updates: Partial<{ name: string; description: string; configuration: ProfileConfiguration }>
  ): Promise<void> {
    const profile = this.registry.require(id);
    const nextConfiguration = updates.configuration ?? profile.configuration;
    validateProfileConfiguration(nextConfiguration);

    const nextMetadata = touchProfileMetadata({
      ...profile.metadata,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
    });

    await this.store.write({ metadata: nextMetadata, configuration: nextConfiguration });
    profile.setMetadata(nextMetadata);
    profile.setConfiguration(nextConfiguration);
    await this.notify("updated", id);
  }

  async cloneProfile(id: string, newName: string): Promise<Profile> {
    const source = this.registry.require(id);
    const cloned = await this.createProfile(
      newName,
      source.metadata.description,
      source.configuration
    );
    await this.notify("cloned", cloned.id);
    return cloned;
  }

  /** Exportación segura: solo metadatos y configuración (los `secretRefs` son claves, nunca valores). */
  async exportProfile(id: string): Promise<string> {
    const profile = this.registry.require(id);
    const bundle: PersistedProfile = {
      metadata: profile.metadata,
      configuration: profile.configuration,
    };
    await this.notify("exported", id);
    return JSON.stringify(bundle, null, 2);
  }

  async importProfile(bundle: string, options: { overwrite?: boolean } = {}): Promise<Profile> {
    let parsed: Partial<PersistedProfile>;
    try {
      parsed = JSON.parse(bundle) as Partial<PersistedProfile>;
    } catch (err) {
      throw ProfileError.wrap(err, {
        code: ProfileErrorCode.PROFILE_IMPORT_FAILED,
        origin: "import",
        recoverable: true,
        message: "El paquete de importación no es JSON válido.",
      });
    }
    if (!parsed || !parsed.metadata || !parsed.configuration) {
      throw createProfileError({
        code: ProfileErrorCode.PROFILE_IMPORT_FAILED,
        message: 'El paquete de importación debe contener "metadata" y "configuration".',
        origin: "import",
        recoverable: true,
      });
    }
    validateProfileConfiguration(parsed.configuration);

    const existing = this.registry.get(parsed.metadata.id);
    if (existing && !options.overwrite) {
      throw createProfileError({
        code: ProfileErrorCode.PROFILE_ALREADY_EXISTS,
        message: `Ya existe un perfil con id "${parsed.metadata.id}"; use overwrite:true para sobrescribirlo.`,
        origin: "import",
        recoverable: true,
      });
    }
    if (existing) {
      this.registry.unregister(parsed.metadata.id);
    }

    const metadata = parsed.metadata as ProfileMetadata;
    const configuration = parsed.configuration as ProfileConfiguration;
    await this.store.write({ metadata, configuration });
    const profile = new Profile(metadata, configuration);
    this.registry.register(profile);
    await this.notify("imported", profile.id);
    return profile;
  }

  async validateProfile(id: string): Promise<void> {
    const profile = this.registry.require(id);
    try {
      await this.validator.validate(profile.configuration);
      await this.notify("validation.ok", id);
    } catch (err) {
      await this.notify("validation.error", id);
      throw err;
    }
  }

  // ---------------------------------------------------------------------
  // Activación
  // ---------------------------------------------------------------------

  /**
   * Activa el perfil: desactiva el previamente activo (si lo hubiera),
   * valida su configuración, y orquesta el resto de gestores integrados
   * (workspace activo, herramientas/adaptadores habilitados, proveedor de
   * IA por defecto) de forma tolerante a fallos parciales.
   */
  async activateProfile(id: string): Promise<void> {
    const profile = this.registry.require(id);
    await this.validator.validate(profile.configuration).catch((err) => {
      throw ProfileError.wrap(err, {
        code: ProfileErrorCode.PROFILE_ACTIVATION_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al activar el perfil "${id}": la configuración no es válida.`,
      });
    });

    const currentActive = this.registry.getActiveId();
    if (currentActive && currentActive !== id) {
      await this.deactivateProfile(currentActive);
    }

    const { configuration } = profile;

    if (
      configuration.workspaceId &&
      this.workspaceManager?.getWorkspace(configuration.workspaceId)
    ) {
      this.workspaceManager.setActiveWorkspace(configuration.workspaceId);
    }
    if (this.toolingManager) {
      for (const toolId of configuration.enabledTools) {
        if (this.toolingManager.getState(toolId) !== undefined) {
          await this.toolingManager.activateTool(toolId).catch(() => {});
        }
      }
    }
    if (this.adapterManager) {
      for (const adapterId of configuration.enabledAdapters) {
        if (this.adapterManager.getState(adapterId) !== undefined) {
          await this.adapterManager.activateAdapter(adapterId).catch(() => {});
        }
      }
    }
    if (configuration.defaultAIProviderId && this.aiManager) {
      try {
        this.aiManager.setActiveProvider(configuration.defaultAIProviderId);
      } catch {
        // El proveedor no está registrado: se ignora, no bloquea la activación del perfil.
      }
    }

    this.registry.setState(id, "active");
    await this.notify("activated", id);
  }

  async deactivateProfile(id: string): Promise<void> {
    this.registry.setState(id, "inactive");
    await this.notify("deactivated", id);
  }

  async setActiveProfile(id: string): Promise<void> {
    await this.activateProfile(id);
  }

  getActiveProfile(): Profile | undefined {
    return this.registry.getActive();
  }

  // ---------------------------------------------------------------------
  // Consulta, búsqueda y recarga
  // ---------------------------------------------------------------------

  getProfile(id: string): Profile | undefined {
    return this.registry.get(id);
  }

  listProfiles(): string[] {
    return this.registry.list();
  }

  searchProfiles(query: string): string[] {
    const needle = query.toLowerCase();
    return this.registry.list().filter((id) => {
      const profile = this.registry.require(id);
      return (
        profile.metadata.name.toLowerCase().includes(needle) ||
        profile.metadata.description.toLowerCase().includes(needle)
      );
    });
  }

  /** Recarga: relee metadatos y configuración desde disco, actualizando la caché en memoria sin alterar el estado. */
  async reloadProfile(id: string): Promise<void> {
    const profile = this.registry.require(id);
    const persisted = await this.store.read(id);
    if (!persisted) {
      throw createProfileError({
        code: ProfileErrorCode.PROFILE_NOT_FOUND,
        message: `No se encontró en disco el perfil "${id}" para recargar.`,
        origin: "persistence",
        recoverable: true,
      });
    }
    profile.setMetadata(persisted.metadata);
    profile.setConfiguration(persisted.configuration);
    await this.notify("reloaded", id);
  }

  getProfileContext(id: string): ProfileContext {
    const profile = this.registry.require(id);
    return {
      profileId: profile.id,
      configuration: profile.configuration,
      ...(this.logger ? { logger: this.logger.withCorrelationId(profile.id) } : {}),
      ...(this.eventBus ? { eventBus: this.eventBus } : {}),
      ...(this.scheduler ? { scheduler: this.scheduler } : {}),
      ...(this.aiManager ? { aiManager: this.aiManager } : {}),
      ...(this.adapterManager ? { adapterManager: this.adapterManager } : {}),
      ...(this.toolingManager ? { toolingManager: this.toolingManager } : {}),
      ...(this.workspaceManager ? { workspaceManager: this.workspaceManager } : {}),
      getSecret: async (key: string) =>
        this.secretsManager ? this.secretsManager.getSecret(key) : undefined,
      getConfigSection: async <T>(namespace: string) =>
        this.configManager ? this.configManager.getSection<T>(namespace) : undefined,
    };
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    // Integración con la configuración normalizada del Core (ADR-002 §8.3),
    // consistente con el patrón ya usado por los demás módulos.
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("profile-manager", {
        profiles: this.registry.list(),
        activeProfileId: this.registry.getActiveId(),
      });
    }

    if (this.scheduler && this.revalidateIntervalMs) {
      this.revalidateTaskHandle = this.scheduler.schedule(
        async () => {
          const activeId = this.registry.getActiveId();
          if (activeId) await this.validateProfile(activeId).catch(() => {});
        },
        { id: REVALIDATE_TASK_ID, intervalMs: this.revalidateIntervalMs }
      );
    }

    context.reportStatus(SystemStatus.OK, "profile-manager inicializado");
  }

  /** Apagado limpio: cancela la revalidación periódica. No modifica el estado de los perfiles ni de otros gestores. */
  async dispose(): Promise<void> {
    this.revalidateTaskHandle?.cancel();
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private async notify(phase: ProfileEventPhase, profileId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`profile.${phase}`, { profileId }, { correlationId: profileId });
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(profileId);
      if (phase.includes("error")) {
        await logger.error(`profile:${phase} ${profileId}`);
      } else {
        await logger.info(`profile:${phase} ${profileId}`);
      }
    }
  }
}
