import { describe, it, expect } from "vitest";
import { ProfileLoader } from "../src/profile/ProfileLoader.js";
import { DEFAULT_CONFIG } from "../src/config/types.js";
import { ErrorCode } from "../src/errors/ErrorCodes.js";
import { MemoryStorageProvider } from "./support/doubles.js";

describe("ProfileLoader", () => {
  it("devuelve null si la configuración no declara ningún perfil activo", async () => {
    const loader = new ProfileLoader(new MemoryStorageProvider());
    const profile = await loader.loadActiveProfile(DEFAULT_CONFIG);
    expect(profile).toBeNull();
  });

  it("carga el descriptor cuando el perfil activo existe", async () => {
    const storage = new MemoryStorageProvider();
    storage.seed(
      "profiles/p1.json",
      JSON.stringify({ id: "p1", name: "Perfil Uno", createdAt: "2026-01-01T00:00:00.000Z" })
    );
    const loader = new ProfileLoader(storage);

    const profile = await loader.loadActiveProfile({ ...DEFAULT_CONFIG, activeProfileId: "p1" });

    expect(profile).toEqual({
      id: "p1",
      name: "Perfil Uno",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("devuelve null (Pendiente) si el perfil activo referenciado no existe físicamente", async () => {
    const loader = new ProfileLoader(new MemoryStorageProvider());
    const profile = await loader.loadActiveProfile({
      ...DEFAULT_CONFIG,
      activeProfileId: "fantasma",
    });
    expect(profile).toBeNull();
  });

  it("lanza PROFILE_LOAD_FAILED si el descriptor es JSON malformado", async () => {
    const storage = new MemoryStorageProvider();
    storage.seed("profiles/p2.json", "{ json malformado");
    const loader = new ProfileLoader(storage);

    await expect(
      loader.loadActiveProfile({ ...DEFAULT_CONFIG, activeProfileId: "p2" })
    ).rejects.toMatchObject({ code: ErrorCode.PROFILE_LOAD_FAILED });
  });

  it("lanza PROFILE_LOAD_FAILED si el descriptor no cumple el esquema esperado", async () => {
    const storage = new MemoryStorageProvider();
    storage.seed("profiles/p3.json", JSON.stringify({ foo: "bar" }));
    const loader = new ProfileLoader(storage);

    await expect(
      loader.loadActiveProfile({ ...DEFAULT_CONFIG, activeProfileId: "p3" })
    ).rejects.toMatchObject({ code: ErrorCode.PROFILE_LOAD_FAILED });
  });

  it("propaga un fallo de lectura de almacenamiento como PROFILE_LOAD_FAILED", async () => {
    const storage = new MemoryStorageProvider({ failReadFor: new Set(["profiles/p4.json"]) });
    const loader = new ProfileLoader(storage);

    await expect(
      loader.loadActiveProfile({ ...DEFAULT_CONFIG, activeProfileId: "p4" })
    ).rejects.toMatchObject({ code: ErrorCode.PROFILE_LOAD_FAILED });
  });
});
