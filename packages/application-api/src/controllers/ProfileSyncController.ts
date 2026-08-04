import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, optionalBoolean, requireString } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import { resolveContentRoot } from "../resolveContentRoot.js";
import type { ProfileConfiguration } from "@dwm/profile";
import type { ProfilePreview, ProfileApplyResult } from "@dwm/project-provisioning";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "profile-sync.preview": {
      payload: { profileId: string; targetProjectId: string };
      result: ProfilePreview;
    };
    "profile-sync.apply": {
      payload: { profileId: string; targetProjectId: string; confirmOverwrite?: boolean };
      result: ProfileApplyResult;
    };
  }
}

/**
 * client-workflow "kilo-content-integration" (Commit 5; alcance de
 * cliente añadido en "kilo-content-integration-completion") —
 * controlador fino: no contiene ninguna lógica de sincronización de
 * perfil propia, delega exclusivamente en `ProfileSyncService` (que a
 * su vez reutiliza `ContentSyncService`, sin motor nuevo). El origen
 * real se resuelve vía `resolveContentRoot` (el mismo que ya usan
 * `ContentSyncController`/`ContentGenerationController`), a partir del
 * `sourceClientId` que el propio perfil ya guarda — nunca un mecanismo
 * de resolución nuevo.
 */
export class ProfileSyncController implements ApplicationController {
  readonly resource = "profile-sync";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const service = () =>
      requireDependency(this.context.profileSyncService, "profile-sync-service");

    const sourceRoot = async (configuration: ProfileConfiguration): Promise<string> =>
      resolveContentRoot(
        this.context,
        configuration.sourceClientId ? { clientId: configuration.sourceClientId } : {}
      );

    const targetRoot = (projectId: string): string => {
      const project = this.context.projectManager?.getProject(projectId);
      if (!project) {
        throw createApplicationError({
          code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
          message: `No existe ningún proyecto con id "${projectId}".`,
          origin: "validation",
          category: "not-found",
          retryable: false,
          recoverable: true,
        });
      }
      return project.configuration.projectPath;
    };

    const profileConfiguration = async (profileId: string) => {
      const profileManager = requireDependency(this.context.profileManager, "profile-manager");
      const profile = await profileManager.getProfile(profileId);
      if (!profile) {
        throw createApplicationError({
          code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
          message: `No existe ningún perfil con id "${profileId}".`,
          origin: "validation",
          category: "not-found",
          retryable: false,
          recoverable: true,
        });
      }
      return profile.configuration;
    };

    permissions.register("profile-sync.preview", ["read"]);
    operations.register({
      name: "profile-sync.preview",
      version: "1.0.0",
      capabilities: ["read"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          profileId: requireString(record, "profileId"),
          targetProjectId: requireString(record, "targetProjectId"),
        };
      },
      handler: async (payload) => {
        const configuration = await profileConfiguration(payload.profileId);
        return service().previewProfile(
          configuration,
          await sourceRoot(configuration),
          targetRoot(payload.targetProjectId)
        );
      },
    });

    permissions.register("profile-sync.apply", ["write"]);
    operations.register({
      name: "profile-sync.apply",
      version: "1.0.0",
      capabilities: ["write"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          profileId: requireString(record, "profileId"),
          targetProjectId: requireString(record, "targetProjectId"),
          ...(optionalBoolean(record, "confirmOverwrite") !== undefined
            ? { confirmOverwrite: optionalBoolean(record, "confirmOverwrite")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const configuration = await profileConfiguration(payload.profileId);
        return service().applyProfile(
          configuration,
          await sourceRoot(configuration),
          targetRoot(payload.targetProjectId),
          payload.targetProjectId,
          {
            ...(payload.confirmOverwrite !== undefined
              ? { confirmOverwrite: payload.confirmOverwrite }
              : {}),
          }
        );
      },
    });
  }
}
