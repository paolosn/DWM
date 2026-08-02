import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import { SecretStore } from "./SecretStore.js";
import type { SecretProvider } from "./SecretProvider.js";
import { DefaultSecretProvider } from "./DefaultSecretProvider.js";
import type { SecretConfiguration } from "./SecretConfiguration.js";
import { validateSecretConfiguration } from "./SecretConfiguration.js";
import { assertValidKey, assertValidValue } from "./key.js";
import type { SecretEntry } from "./SecretEntry.js";
import { createInitialEntry, withUpdatedCipherText, withRotatedCipherText } from "./SecretEntry.js";
import { SecretErrorCode } from "./errors/SecretErrorCode.js";
import { SecretError, createSecretError } from "./errors/SecretError.js";

export interface SecretsManagerOptions {
  readonly configuration: SecretConfiguration;
  /** Proveedor de cifrado; por defecto, `DefaultSecretProvider` (AES-256-GCM). */
  readonly provider?: SecretProvider;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  /** Gestor de configuración de @dwm/config, para publicar la propia sección de este módulo. */
  readonly configManager?: ConfigManager;
}

export type SecretMetadataView = Omit<SecretEntry, "cipherText">;

export interface ImportResult {
  readonly imported: readonly string[];
  readonly skipped: readonly string[];
}

type SecretEventPhase = "created" | "updated" | "deleted" | "rotated" | "exported" | "imported";

/**
 * Módulo de gestión de secretos del sistema DWM. Implementa `IModule`
 * (ADR-002 §3): se registra en el Core mediante `registerModule`, recibe
 * únicamente el `ModuleContext` mínimo, y no contiene lógica de ninguna
 * herramienta o sistema operativo. Ningún valor de secreto viaja jamás como
 * payload de un evento ni aparece en un mensaje de error (ADR-002 §5.7):
 * solo se comunica la clave afectada.
 */
export class SecretsManager implements IModule {
  readonly id = "secrets-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly store: SecretStore;
  private readonly provider: SecretProvider;
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;

  constructor(options: SecretsManagerOptions) {
    validateSecretConfiguration(options.configuration);
    this.store = new SecretStore(options.configuration.secretsDir);
    this.provider = options.provider ?? new DefaultSecretProvider(options.configuration.masterKey);
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
  }

  async createSecret(
    key: string,
    value: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    assertValidKey(key);
    assertValidValue(value);
    if (await this.store.read(key)) {
      throw createSecretError({
        code: SecretErrorCode.SECRETS_ALREADY_EXISTS,
        message: `Ya existe un secreto con la clave "${key}".`,
        origin: "key",
        recoverable: true,
      });
    }
    const cipherText = await this.provider.encrypt(value);
    await this.store.write(createInitialEntry(key, cipherText, metadata));
    await this.notify("created", key);
  }

  async updateSecret(key: string, value: string): Promise<void> {
    assertValidKey(key);
    assertValidValue(value);
    const existing = await this.requireEntry(key);
    const cipherText = await this.provider.encrypt(value);
    await this.store.write(withUpdatedCipherText(existing, cipherText));
    await this.notify("updated", key);
  }

  async deleteSecret(key: string): Promise<void> {
    await this.requireEntry(key);
    await this.store.delete(key);
    await this.notify("deleted", key);
  }

  async getSecret(key: string): Promise<string | undefined> {
    assertValidKey(key);
    const entry = await this.store.read(key);
    if (!entry) return undefined;
    return this.provider.decrypt(entry.cipherText);
  }

  async requireSecret(key: string): Promise<string> {
    const value = await this.getSecret(key);
    if (value === undefined) {
      throw createSecretError({
        code: SecretErrorCode.SECRETS_NOT_FOUND,
        message: `No existe ningún secreto con la clave "${key}".`,
        origin: "key",
        recoverable: true,
      });
    }
    return value;
  }

  async hasSecret(key: string): Promise<boolean> {
    assertValidKey(key);
    return (await this.store.read(key)) !== undefined;
  }

  async listKeys(): Promise<string[]> {
    return (await this.store.listKeys()).sort();
  }

  async searchKeys(prefix: string): Promise<string[]> {
    const keys = await this.listKeys();
    return keys.filter((key) => key.startsWith(prefix));
  }

  /** Rotación de un secreto: sustituye su valor, incrementa `version` y marca `rotatedAt`. */
  async rotateSecret(key: string, newValue: string): Promise<void> {
    assertValidValue(newValue);
    const existing = await this.requireEntry(key);
    const cipherText = await this.provider.encrypt(newValue);
    await this.store.write(withRotatedCipherText(existing, cipherText));
    await this.notify("rotated", key);
  }

  /** Metadatos de una entrada (sin `cipherText`, nunca el valor del secreto). */
  async getEntryMetadata(key: string): Promise<SecretMetadataView | undefined> {
    assertValidKey(key);
    const entry = await this.store.read(key);
    if (!entry) return undefined;
    const { cipherText, ...rest } = entry;
    void cipherText;
    return rest;
  }

  /**
   * Exportación segura: devuelve todas las entradas tal como están
   * persistidas (siempre cifradas). Ningún valor en texto plano sale jamás
   * de este método.
   */
  async exportSecrets(): Promise<string> {
    const keys = await this.store.listKeys();
    const entries: SecretEntry[] = [];
    for (const key of keys) {
      const entry = await this.store.read(key);
      if (entry) entries.push(entry);
    }
    await this.notify("exported", "*");
    return JSON.stringify({ entries }, null, 2);
  }

  /**
   * Importación segura: recibe exactamente el formato producido por
   * `exportSecrets()` (entradas ya cifradas); no descifra ni valida el
   * contenido del secreto, solo su forma. Por defecto no sobrescribe claves
   * existentes, salvo que se indique `overwrite: true`.
   */
  async importSecrets(
    bundle: string,
    options: { overwrite?: boolean } = {}
  ): Promise<ImportResult> {
    let parsed: { entries?: unknown };
    try {
      parsed = JSON.parse(bundle) as { entries?: unknown };
    } catch (err) {
      throw SecretError.wrap(err, {
        code: SecretErrorCode.SECRETS_IMPORT_FAILED,
        origin: "import",
        recoverable: true,
        message: "El paquete de importación no es JSON válido.",
      });
    }

    if (!parsed || !Array.isArray(parsed.entries)) {
      throw createSecretError({
        code: SecretErrorCode.SECRETS_IMPORT_FAILED,
        message: 'El paquete de importación debe contener un array "entries".',
        origin: "import",
        recoverable: true,
      });
    }

    const imported: string[] = [];
    const skipped: string[] = [];

    for (const rawEntry of parsed.entries) {
      const entry = rawEntry as Partial<SecretEntry>;
      if (!entry || typeof entry.key !== "string" || typeof entry.cipherText !== "string") {
        throw createSecretError({
          code: SecretErrorCode.SECRETS_IMPORT_FAILED,
          message: "El paquete de importación contiene una entrada mal formada.",
          origin: "import",
          recoverable: true,
        });
      }
      assertValidKey(entry.key);

      const exists = await this.store.read(entry.key);
      if (exists && !options.overwrite) {
        skipped.push(entry.key);
        continue;
      }
      await this.store.write(entry as SecretEntry);
      imported.push(entry.key);
    }

    await this.notify("imported", "*");
    return { imported, skipped };
  }

  async init(context: ModuleContext): Promise<void> {
    // Integración con la configuración normalizada del Core (ADR-002 §8.3),
    // consistente con el patrón ya usado por los demás módulos.
    context.getConfig();
    if (this.configManager) {
      const keys = await this.listKeys();
      await this.configManager.setSection("secrets", { keyCount: keys.length });
    }
    context.reportStatus(SystemStatus.OK, "secrets-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin estado en memoria que liberar: cada operación es de lectura/escritura directa.
  }

  private async requireEntry(key: string): Promise<SecretEntry> {
    assertValidKey(key);
    const entry = await this.store.read(key);
    if (!entry) {
      throw createSecretError({
        code: SecretErrorCode.SECRETS_NOT_FOUND,
        message: `No existe ningún secreto con la clave "${key}".`,
        origin: "key",
        recoverable: true,
      });
    }
    return entry;
  }

  private async notify(phase: SecretEventPhase, key: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`secrets.${phase}`, { key }, { correlationId: key });
    }
    if (this.logger) {
      await this.logger.withCorrelationId(key).info(`secrets:${phase} ${key}`);
    }
  }
}
