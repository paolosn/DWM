import type { StorageProvider } from "./StorageProvider.js";
import { DEFAULT_CONFIG, type NormalizedConfig } from "./types.js";
import { DWMError } from "../errors/DWMError.js";
import { ErrorCode } from "../errors/ErrorCodes.js";

const CONFIG_KEY = "config.json";

/**
 * Responsable exclusivo de cargar y guardar la configuración normalizada
 * (README §1 / ADR-001 §9). No conoce el formato nativo de ninguna
 * herramienta externa; solo lee/escribe el esquema `NormalizedConfig`.
 */
export class ConfigManager {
  private current: NormalizedConfig | null = null;

  constructor(private readonly storage: StorageProvider) {}

  /**
   * Carga la configuración desde el almacenamiento. Si no existe (primera
   * ejecución, FRS-001 §1.4), crea y persiste la configuración por defecto.
   */
  async load(): Promise<NormalizedConfig> {
    let raw: string | null;
    try {
      raw = await this.storage.read(CONFIG_KEY);
    } catch (err) {
      throw DWMError.wrap(err, {
        code: ErrorCode.CONFIG_LOAD_FAILED,
        origin: "config",
        recoverable: false,
      });
    }

    if (raw === null) {
      this.current = { ...DEFAULT_CONFIG };
      await this.save(this.current);
      return this.current;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw DWMError.wrap(err, {
        code: ErrorCode.CONFIG_MALFORMED,
        message: "La configuración almacenada no es JSON válido.",
        origin: "config",
        recoverable: false,
      });
    }

    if (!this.isNormalizedConfig(parsed)) {
      throw new DWMError({
        code: ErrorCode.CONFIG_MALFORMED,
        message: "La configuración almacenada no cumple el esquema esperado.",
        origin: "config",
        recoverable: false,
      });
    }

    this.current = parsed;
    return this.current;
  }

  /** Devuelve la configuración actualmente cargada. Lanza si aún no se cargó. */
  get(): NormalizedConfig {
    if (!this.current) {
      throw new DWMError({
        code: ErrorCode.NOT_READY,
        message: "ConfigManager.get() invocado antes de load().",
        origin: "config",
        recoverable: false,
      });
    }
    return this.current;
  }

  /** Persiste una nueva configuración completa y la deja como la actual. */
  async save(config: NormalizedConfig): Promise<void> {
    try {
      await this.storage.write(CONFIG_KEY, JSON.stringify(config, null, 2));
      this.current = config;
    } catch (err) {
      throw DWMError.wrap(err, {
        code: ErrorCode.STORAGE_WRITE_FAILED,
        origin: "config",
        recoverable: false,
      });
    }
  }

  /** Actualiza parcialmente la configuración actual y la persiste. */
  async update(patch: Partial<NormalizedConfig>): Promise<NormalizedConfig> {
    const next: NormalizedConfig = { ...this.get(), ...patch };
    await this.save(next);
    return next;
  }

  private isNormalizedConfig(value: unknown): value is NormalizedConfig {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
      typeof v.schemaVersion === "string" &&
      (v.activeProfileId === null || typeof v.activeProfileId === "string") &&
      typeof v.preferences === "object" &&
      v.preferences !== null
    );
  }
}
