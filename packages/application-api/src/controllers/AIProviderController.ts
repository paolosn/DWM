import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, requireString, optionalString } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import type { HttpAIProviderFormat, ConnectionStatus } from "@dwm/ai-manager";
import { resolveAiConfig } from "../resolveAiConfig.js";
import {
  loadStoredProviders,
  saveStoredProviders,
  buildHttpProvider,
  type StoredAIProviderConfig,
} from "../AIProviderStore.js";

export interface AIProviderView {
  readonly id: string;
  readonly name: string;
  readonly format: HttpAIProviderFormat;
  readonly baseUrl: string;
  readonly model: string;
  readonly fallbackModel?: string;
  readonly isDefault: boolean;
  /** Nunca la API key: solo si ya hay una credencial real guardada. */
  readonly hasCredential: boolean;
  readonly connectionStatus: ConnectionStatus;
}

const VALID_PROVIDER_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function credentialKeyFor(id: string): string {
  return `ai-provider.${id}`;
}

function isHttpAIProviderFormat(value: unknown): value is HttpAIProviderFormat {
  return value === "openai" || value === "anthropic";
}

function invalidPayload(message: string): never {
  throw createApplicationError({
    code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
    message,
    origin: "validation",
    category: "validation",
    retryable: false,
    recoverable: true,
  });
}

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    /**
     * Lista real de proveedores de IA configurados — nunca incluye la
     * API key, solo si hay una credencial real guardada
     * (`hasCredential`). Cierra el bloqueo "Función no disponible en
     * esta versión" (client-workflow-v2, objetivo 1).
     */
    "ai.list-providers": { payload: Record<string, never>; result: readonly AIProviderView[] };
    /**
     * Añade un proveedor real: soporta cualquier endpoint compatible
     * con OpenAI Chat Completions (OpenAI, OpenRouter, Ollama, LM
     * Studio, despliegues propios) o con Anthropic Messages — mismo
     * `HttpAIProvider` genérico ya existente, nunca un proveedor fijo
     * hardcodeado. La API key se guarda exclusivamente vía
     * `SecretsManager.createSecret`; nunca se persiste en perfiles,
     * clientes ni proyectos, nunca en logs, nunca se devuelve completa.
     */
    "ai.add-provider": {
      payload: {
        id: string;
        name: string;
        format: HttpAIProviderFormat;
        baseUrl: string;
        model: string;
        fallbackModel?: string;
        apiKey: string;
        setDefault?: boolean;
      };
      result: AIProviderView;
    };
    /**
     * Edita un proveedor real ya existente. Si se indica `apiKey`,
     * rota la credencial real vía `SecretsManager.updateSecret` — si
     * no, la credencial existente se conserva intacta.
     */
    "ai.update-provider": {
      payload: {
        id: string;
        name?: string;
        baseUrl?: string;
        model?: string;
        fallbackModel?: string;
        apiKey?: string;
      };
      result: AIProviderView;
    };
    /** Elimina un proveedor real y su credencial real asociada — nunca deja un secreto huérfano. */
    "ai.delete-provider": { payload: { id: string }; result: { deleted: true } };
    "ai.set-default-provider": { payload: { id: string }; result: { id: string } };
    /** Prueba de conexión real contra el proveedor — reutiliza AIManager.checkHealth(), nunca simulada. */
    "ai.test-connection": {
      payload: { id: string };
      result: { success: boolean; message: string };
    };
    /**
     * client-workflow "fix/kilo-file-editing-and-ai-status" —
     * "Probar modelo" real: llamada mínima real vía
     * AIManager.sendRequest() (nunca simulada, nunca otro cliente
     * HTTP). Nunca devuelve la API key, solo el resultado.
     */
    "ai.test-model": {
      payload: { id: string; model?: string };
      result:
        | {
            success: true;
            provider: string;
            model: string | undefined;
            latencyMs: number;
            response: string;
          }
        | { success: false; message: string };
    };
    /**
     * client-workflow "fix/kilo-file-editing-and-ai-status" — "Modelo
     * efectivo" real: resuelve qué proveedor/modelo aplicaría DWM en
     * un contexto dado (proyecto/cliente/global), reutilizando el
     * único resolutor compartido `resolveAiConfig` (antes duplicado
     * entre ProvisioningController y ContentGenerationController).
     */
    "ai.get-effective": {
      payload: { projectId?: string; clientId?: string };
      result: {
        readonly origin: "project" | "client" | "global";
        readonly provider?: string;
        readonly providerName?: string;
        readonly model?: string;
        readonly fallbackModel?: string;
        readonly baseUrl?: string;
        readonly hasCredential: boolean;
        readonly status: "ACTIVO" | "INACTIVO" | "ERROR";
      };
    };
  }
}

/**
 * client-workflow-v2 (cierre de bloqueos funcionales, objetivo 1) —
 * controlador real de gestión de proveedores de IA. Delega
 * íntegramente en `AIManager` (registro/activación/salud, ya
 * existente en `@dwm/ai-manager`) y `SecretsManager` (credenciales,
 * ya existente en `@dwm/secrets`) — ningún manager nuevo. Los
 * metadatos NO sensibles de cada proveedor se persisten vía
 * `ConfigManager` (ver `AIProviderStore`, mismo sistema `config.*` ya
 * usado en toda la app), y se reconstruyen en `AIManager` en cada
 * arranque (`restoreStoredProviders`, cableado en el proceso principal).
 */
export class AIProviderController implements ApplicationController {
  readonly resource = "ai-providers";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const aiManager = () => requireDependency(this.context.aiManager, "ai-manager");
    const secretsManager = () => requireDependency(this.context.secretsManager, "secrets-manager");
    const configManager = () => requireDependency(this.context.configManager, "config");

    const toView = async (config: StoredAIProviderConfig): Promise<AIProviderView> => {
      const activeId = aiManager().getActiveProviderId();
      const connection = aiManager().getConnection(config.id);
      const hasCredential = await secretsManager().hasSecret(config.credentialKey);
      return {
        id: config.id,
        name: config.name,
        format: config.format,
        baseUrl: config.baseUrl,
        model: config.model,
        ...(config.fallbackModel !== undefined ? { fallbackModel: config.fallbackModel } : {}),
        isDefault: activeId === config.id,
        hasCredential,
        connectionStatus: connection?.status ?? "disconnected",
      };
    };

    permissions.register("ai.list-providers", ["read"]);
    operations.register({
      name: "ai.list-providers",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async () => {
        const stored = await loadStoredProviders(configManager());
        return Promise.all(stored.map((config) => toView(config)));
      },
    });

    permissions.register("ai.add-provider", ["write"]);
    operations.register({
      name: "ai.add-provider",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const format = record["format"];
        if (!isHttpAIProviderFormat(format)) {
          invalidPayload(
            `"format" debe ser "openai" o "anthropic", recibido: "${String(format)}".`
          );
        }
        const apiKey = record["apiKey"];
        if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
          invalidPayload('"apiKey" es obligatoria y no puede estar vacía.');
        }
        const id = requireString(record, "id");
        if (!VALID_PROVIDER_ID.test(id)) {
          invalidPayload(
            `"id" solo puede contener letras, números, guiones y guiones bajos: "${id}".`
          );
        }
        return {
          id,
          name: requireString(record, "name"),
          format: format as HttpAIProviderFormat,
          baseUrl: requireString(record, "baseUrl"),
          model: requireString(record, "model"),
          ...(optionalString(record, "fallbackModel") !== undefined
            ? { fallbackModel: optionalString(record, "fallbackModel")! }
            : {}),
          apiKey: apiKey as string,
          setDefault: record["setDefault"] === true,
        };
      },
      handler: async (payload) => {
        const stored = await loadStoredProviders(configManager());
        if (stored.some((p) => p.id === payload.id)) {
          invalidPayload(`Ya existe un proveedor de IA con id "${payload.id}".`);
        }
        const credentialKey = credentialKeyFor(payload.id);
        await secretsManager().createSecret(credentialKey, payload.apiKey);

        const config: StoredAIProviderConfig = {
          id: payload.id,
          name: payload.name,
          format: payload.format,
          baseUrl: payload.baseUrl,
          model: payload.model,
          ...(payload.fallbackModel !== undefined ? { fallbackModel: payload.fallbackModel } : {}),
          credentialKey,
          isDefault: payload.setDefault === true || stored.length === 0,
        };

        aiManager().registerProvider(buildHttpProvider(config), {
          credentialKey,
          setActive: config.isDefault,
        });

        const next = stored.map((p) => ({ ...p, isDefault: p.isDefault && !config.isDefault }));
        await saveStoredProviders(configManager(), [...next, config]);
        return toView(config);
      },
    });

    permissions.register("ai.update-provider", ["write"]);
    operations.register({
      name: "ai.update-provider",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          id: requireString(record, "id"),
          ...(optionalString(record, "name") !== undefined
            ? { name: optionalString(record, "name")! }
            : {}),
          ...(optionalString(record, "baseUrl") !== undefined
            ? { baseUrl: optionalString(record, "baseUrl")! }
            : {}),
          ...(optionalString(record, "model") !== undefined
            ? { model: optionalString(record, "model")! }
            : {}),
          ...(optionalString(record, "fallbackModel") !== undefined
            ? { fallbackModel: optionalString(record, "fallbackModel")! }
            : {}),
          ...(optionalString(record, "apiKey") !== undefined
            ? { apiKey: optionalString(record, "apiKey")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const stored = await loadStoredProviders(configManager());
        const existing = stored.find((p) => p.id === payload.id);
        if (!existing) {
          invalidPayload(`No existe ningún proveedor de IA con id "${payload.id}".`);
        }

        if (payload.apiKey) {
          await secretsManager().updateSecret(existing.credentialKey, payload.apiKey);
        }

        const updated: StoredAIProviderConfig = {
          ...existing,
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.baseUrl !== undefined ? { baseUrl: payload.baseUrl } : {}),
          ...(payload.model !== undefined ? { model: payload.model } : {}),
          ...(payload.fallbackModel !== undefined ? { fallbackModel: payload.fallbackModel } : {}),
        };

        aiManager().unregisterProvider(existing.id);
        aiManager().registerProvider(buildHttpProvider(updated), {
          credentialKey: updated.credentialKey,
          setActive: existing.isDefault,
        });

        await saveStoredProviders(
          configManager(),
          stored.map((p) => (p.id === updated.id ? updated : p))
        );
        return toView(updated);
      },
    });

    permissions.register("ai.delete-provider", ["write"]);
    operations.register({
      name: "ai.delete-provider",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { id: requireString(record, "id") };
      },
      handler: async (payload) => {
        const stored = await loadStoredProviders(configManager());
        const existing = stored.find((p) => p.id === payload.id);
        if (!existing) {
          invalidPayload(`No existe ningún proveedor de IA con id "${payload.id}".`);
        }
        aiManager().unregisterProvider(existing.id);
        await secretsManager()
          .deleteSecret(existing.credentialKey)
          .catch(() => undefined);
        const remaining = stored.filter((p) => p.id !== payload.id);
        // Si el proveedor eliminado era el predeterminado, el primero que quede pasa a serlo.
        const next =
          existing.isDefault && remaining.length > 0
            ? remaining.map((p, index) => ({ ...p, isDefault: index === 0 }))
            : remaining;
        await saveStoredProviders(configManager(), next);
        if (existing.isDefault && next[0]) {
          aiManager().setActiveProvider(next[0].id);
        }
        return { deleted: true as const };
      },
    });

    permissions.register("ai.set-default-provider", ["write"]);
    operations.register({
      name: "ai.set-default-provider",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { id: requireString(record, "id") };
      },
      handler: async (payload) => {
        const stored = await loadStoredProviders(configManager());
        if (!stored.some((p) => p.id === payload.id)) {
          invalidPayload(`No existe ningún proveedor de IA con id "${payload.id}".`);
        }
        aiManager().setActiveProvider(payload.id);
        await saveStoredProviders(
          configManager(),
          stored.map((p) => ({ ...p, isDefault: p.id === payload.id }))
        );
        return { id: payload.id };
      },
    });

    permissions.register("ai.test-connection", ["read"]);
    operations.register({
      name: "ai.test-connection",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { id: requireString(record, "id") };
      },
      handler: async (payload) => {
        try {
          const healthy = await aiManager().checkHealth(payload.id);
          return {
            success: healthy,
            message: healthy
              ? "Conexión real correcta."
              : "El proveedor respondió, pero la comprobación de salud no fue satisfactoria.",
          };
        } catch (err) {
          return {
            success: false,
            message: err instanceof Error ? err.message : "No se pudo conectar con el proveedor.",
          };
        }
      },
    });

    permissions.register("ai.test-model", ["read"]);
    operations.register({
      name: "ai.test-model",
      version: "1.0.0",
      capabilities: ["read"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          id: requireString(record, "id"),
          ...(optionalString(record, "model") !== undefined
            ? { model: optionalString(record, "model")! }
            : {}),
        };
      },
      handler: async (payload) => {
        try {
          const response = await aiManager().sendRequest(
            {
              prompt: "Responde únicamente con la palabra: OK.",
              maxTokens: 20,
              temperature: 0,
              ...(payload.model ? { model: payload.model } : {}),
            },
            payload.id
          );
          return {
            success: true as const,
            provider: response.providerId,
            model: response.model,
            latencyMs: response.latencyMs,
            response: response.content.slice(0, 200),
          };
        } catch (err) {
          return {
            success: false as const,
            message: err instanceof Error ? err.message : "No se pudo probar el modelo.",
          };
        }
      },
    });

    permissions.register("ai.get-effective", ["read"]);
    operations.register({
      name: "ai.get-effective",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload ?? {});
        return {
          ...(optionalString(record, "projectId") !== undefined
            ? { projectId: optionalString(record, "projectId")! }
            : {}),
          ...(optionalString(record, "clientId") !== undefined
            ? { clientId: optionalString(record, "clientId")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const resolved = await resolveAiConfig(this.context, payload.projectId, payload.clientId);

        // Alcance global: el "efectivo" es el proveedor real marcado
        // como predeterminado en ai.list-providers (mismo mecanismo,
        // ningún resolutor paralelo).
        if (resolved.origin === "global" && !resolved.provider) {
          const stored = await loadStoredProviders(configManager());
          const active = stored.find((p) => p.isDefault);
          if (!active) {
            return { origin: "global" as const, hasCredential: false, status: "INACTIVO" as const };
          }
          const hasCredential = await secretsManager().hasSecret(active.credentialKey);
          const connection = aiManager().getConnection(active.id);
          return {
            origin: "global" as const,
            provider: active.id,
            providerName: active.name,
            model: active.model,
            ...(active.fallbackModel !== undefined ? { fallbackModel: active.fallbackModel } : {}),
            baseUrl: active.baseUrl,
            hasCredential,
            status: connection?.status === "error" ? ("ERROR" as const) : ("ACTIVO" as const),
          };
        }

        // Alcance cliente/proyecto: el nombre visible se resuelve
        // contra los proveedores globales conocidos si el `provider`
        // coincide con uno real; si no, se muestra tal cual (sigue
        // siendo un dato real, nunca inventado).
        const stored = await loadStoredProviders(configManager());
        const matching = resolved.provider
          ? stored.find((p) => p.id === resolved.provider)
          : undefined;
        const hasCredential = resolved.secretReference
          ? await secretsManager().hasSecret(resolved.secretReference)
          : matching
            ? await secretsManager().hasSecret(matching.credentialKey)
            : false;
        const connection = resolved.provider
          ? aiManager().getConnection(resolved.provider)
          : undefined;

        return {
          origin: resolved.origin,
          ...(resolved.provider !== undefined ? { provider: resolved.provider } : {}),
          ...(matching ? { providerName: matching.name } : {}),
          ...(resolved.model !== undefined ? { model: resolved.model } : {}),
          ...(resolved.fallbackModel !== undefined
            ? { fallbackModel: resolved.fallbackModel }
            : {}),
          ...(resolved.baseUrl !== undefined ? { baseUrl: resolved.baseUrl } : {}),
          hasCredential,
          status: !resolved.provider
            ? ("INACTIVO" as const)
            : connection?.status === "error"
              ? ("ERROR" as const)
              : ("ACTIVO" as const),
        };
      },
    });
  }
}
