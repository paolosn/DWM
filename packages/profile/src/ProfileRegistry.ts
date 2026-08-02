import type { Profile } from "./Profile.js";
import { isProfileStateTransitionAllowed, type ProfileState } from "./ProfileState.js";
import { ProfileErrorCode } from "./errors/ProfileErrorCode.js";
import { createProfileError } from "./errors/ProfileError.js";

/** Mantiene el conjunto de perfiles registrados (caché en memoria) y cuál está activo. */
export class ProfileRegistry {
  private readonly profiles = new Map<string, Profile>();
  private activeId: string | null = null;

  register(profile: Profile): void {
    if (this.profiles.has(profile.id)) {
      throw createProfileError({
        code: ProfileErrorCode.PROFILE_ALREADY_EXISTS,
        message: `Ya existe un perfil registrado con id "${profile.id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.profiles.set(profile.id, profile);
  }

  unregister(id: string): void {
    this.profiles.delete(id);
    if (this.activeId === id) this.activeId = null;
  }

  get(id: string): Profile | undefined {
    return this.profiles.get(id);
  }

  require(id: string): Profile {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw createProfileError({
        code: ProfileErrorCode.PROFILE_NOT_FOUND,
        message: `No existe ningún perfil registrado con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return profile;
  }

  list(): string[] {
    return [...this.profiles.keys()].sort();
  }

  /** Aplica la transición de estado; si `next` es "active" fija este perfil como activo, y si el perfil activo deja de estarlo, limpia el activo. */
  setState(id: string, next: ProfileState): void {
    const profile = this.require(id);
    if (!isProfileStateTransitionAllowed(profile.state, next)) {
      throw createProfileError({
        code: ProfileErrorCode.PROFILE_INVALID_STATE_TRANSITION,
        message: `Transición de estado no permitida para "${id}": "${profile.state}" → "${next}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    profile.setState(next);
    if (next === "active") {
      this.activeId = id;
    } else if (this.activeId === id) {
      this.activeId = null;
    }
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  getActive(): Profile | undefined {
    return this.activeId ? this.profiles.get(this.activeId) : undefined;
  }

  clear(): void {
    this.profiles.clear();
    this.activeId = null;
  }
}
