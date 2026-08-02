import type { StorageProvider } from "../config/StorageProvider.js";
import type { NormalizedConfig } from "../config/types.js";
import type { ProfileDescriptor } from "./types.js";
import { DWMError } from "../errors/DWMError.js";
import { ErrorCode } from "../errors/ErrorCodes.js";

const profileKey = (profileId: string) => `profiles/${profileId}.json`;

/**
 * Responsable exclusivo de cargar el descriptor del perfil activo (README §1).
 * No implementa creación, exportación, importación ni cambio completo de
 * perfil (FRS-001 §7): esa lógica de negocio pertenece al futuro Profile
 * Manager. El Core solo necesita saber "cuál es el perfil activo, si existe".
 */
export class ProfileLoader {
  constructor(private readonly storage: StorageProvider) {}

  /**
   * Carga el perfil activo según `config.activeProfileId`. Si no hay ningún
   * perfil activo configurado, devuelve `null` (estado válido: Pendiente,
   * FRS-001 §15), no un error.
   */
  async loadActiveProfile(config: NormalizedConfig): Promise<ProfileDescriptor | null> {
    if (!config.activeProfileId) {
      return null;
    }

    let raw: string | null;
    try {
      raw = await this.storage.read(profileKey(config.activeProfileId));
    } catch (err) {
      throw DWMError.wrap(err, {
        code: ErrorCode.PROFILE_LOAD_FAILED,
        origin: "profile",
        recoverable: false,
      });
    }

    if (raw === null) {
      // El identificador apunta a un perfil que ya no existe físicamente:
      // se trata como advertencia recuperable, no como fallo de arranque.
      // El Core continúa sin perfil activo (Pendiente); un módulo superior
      // (Profile Manager / Status Manager) podrá alertar al usuario.
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw DWMError.wrap(err, {
        code: ErrorCode.PROFILE_LOAD_FAILED,
        message: "El descriptor de perfil activo no es JSON válido.",
        origin: "profile",
        recoverable: false,
      });
    }

    if (!this.isProfileDescriptor(parsed)) {
      throw new DWMError({
        code: ErrorCode.PROFILE_LOAD_FAILED,
        message: "El descriptor de perfil activo no cumple el esquema esperado.",
        origin: "profile",
        recoverable: false,
      });
    }

    return parsed;
  }

  private isProfileDescriptor(value: unknown): value is ProfileDescriptor {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
      typeof v.id === "string" && typeof v.name === "string" && typeof v.createdAt === "string"
    );
  }
}
