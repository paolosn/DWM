import type { ConfigManager } from "@dwm/config";
import type { AIManager } from "@dwm/ai-manager";
import { HttpAIProvider, type HttpAIProviderFormat } from "@dwm/ai-manager";

/**
 * client-workflow-v2 (cierre de bloqueos funcionales, objetivo 1) —
 * `AIManager` gestiona proveedores en memoria (`registerProvider`/
 * `unregisterProvider`/`setActiveProvider`) pero no los persiste entre
 * arranques: solo la credencial sobrevive, vía `@dwm/secrets`. Esta es
 * la única fuente real de metadatos NO sensibles de cada proveedor
 * (id/nombre/formato/baseUrl/modelo — nunca la API key), reutilizando
 * `ConfigManager` ya existente (sección `ai-providers`, mismo sistema
 * que ya usa el resto de la app para `config.*`) — no se crea ningún
 * almacén nuevo. La API key en sí vive exclusivamente en
 * `@dwm/secrets`, referenciada aquí solo por su clave.
 */
export interface StoredAIProviderConfig {
  readonly id: string;
  readonly name: string;
  readonly format: HttpAIProviderFormat;
  readonly baseUrl: string;
  readonly model: string;
  readonly fallbackModel?: string;
  /** Clave real de @dwm/secrets — nunca el valor de la API key. */
  readonly credentialKey: string;
  readonly isDefault: boolean;
}

const CONFIG_SECTION = "ai-providers";

interface StoredSection {
  readonly providers: readonly StoredAIProviderConfig[];
}

export async function loadStoredProviders(
  configManager: ConfigManager
): Promise<readonly StoredAIProviderConfig[]> {
  const section = await configManager.getSection<StoredSection>(CONFIG_SECTION);
  return section?.providers ?? [];
}

export async function saveStoredProviders(
  configManager: ConfigManager,
  providers: readonly StoredAIProviderConfig[]
): Promise<void> {
  await configManager.setSection<StoredSection>(CONFIG_SECTION, { providers });
}

export function buildHttpProvider(config: StoredAIProviderConfig): HttpAIProvider {
  return new HttpAIProvider({
    id: config.id,
    name: config.name,
    baseUrl: config.baseUrl,
    format: config.format,
  });
}

/**
 * Reconstruye en `AIManager` (en memoria) todos los proveedores
 * persistidos, en cada arranque del motor. Reutiliza exactamente
 * `registerProvider` ya existente — ningún mecanismo de restauración
 * nuevo.
 */
export async function restoreStoredProviders(
  aiManager: AIManager,
  configManager: ConfigManager
): Promise<void> {
  const providers = await loadStoredProviders(configManager);
  for (const config of providers) {
    aiManager.registerProvider(buildHttpProvider(config), {
      credentialKey: config.credentialKey,
      setActive: config.isDefault,
    });
  }
}
