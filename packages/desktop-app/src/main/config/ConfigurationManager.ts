import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Logger } from "@dwm/logger";
import {
  DEFAULT_DESKTOP_CONFIGURATION,
  normalizeDesktopConfiguration,
  type DesktopConfiguration,
} from "../../shared/types/DesktopConfig.js";

export const DESKTOP_CONFIG_FILE_NAME = "desktop-config.json";

export interface ConfigurationManagerOptions {
  /** Directorio donde persistir la configuración (típicamente `app.getPath("userData")`). */
  readonly directory: string;
  readonly fileName?: string;
  readonly logger?: Logger;
}

/**
 * Módulo 32 — Desktop Application. Persiste la configuración propia del
 * shell Desktop (posición/tamaño de ventana, última sección de navegación)
 * como JSON en el directorio de datos de usuario del sistema operativo.
 *
 * No persiste NUNCA configuración funcional de negocio: esa responsabilidad
 * es exclusiva de `@dwm/config`, accesible solo a través de la Application
 * API. Cualquier fallo de lectura/escritura se degrada de forma segura
 * (valores por defecto, o simplemente se ignora en escritura) porque la
 * persistencia de la ventana nunca debe impedir que la aplicación funcione.
 */
export class ConfigurationManager {
  private readonly filePath: string;
  private readonly logger?: Logger;
  private cache: DesktopConfiguration = DEFAULT_DESKTOP_CONFIGURATION;

  constructor(options: ConfigurationManagerOptions) {
    this.filePath = join(options.directory, options.fileName ?? DESKTOP_CONFIG_FILE_NAME);
    if (options.logger) this.logger = options.logger;
  }

  getFilePath(): string {
    return this.filePath;
  }

  /** Configuración actualmente en memoria (tras el último `load()` o `save()` con éxito). */
  getCurrent(): DesktopConfiguration {
    return this.cache;
  }

  async load(): Promise<DesktopConfiguration> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      this.cache = normalizeDesktopConfiguration(parsed);
    } catch (error) {
      void this.logger?.warn(
        "No se pudo leer la configuración de escritorio; se usan valores por defecto.",
        {
          filePath: this.filePath,
          reason: error instanceof Error ? error.message : String(error),
        }
      );
      this.cache = DEFAULT_DESKTOP_CONFIGURATION;
    }
    return this.cache;
  }

  async save(patch: Partial<DesktopConfiguration>): Promise<DesktopConfiguration> {
    const next = normalizeDesktopConfiguration({ ...this.cache, ...patch });
    this.cache = next;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(next, null, 2), "utf-8");
    } catch (error) {
      void this.logger?.warn("No se pudo persistir la configuración de escritorio.", {
        filePath: this.filePath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return next;
  }
}
