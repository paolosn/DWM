import { describe, it, expect } from "vitest";
import {
  ProfileError,
  createProfileError,
  ProfileErrorCode,
  ProfileManager,
  ProfileRegistry,
  Profile,
} from "../../src/index.js";

describe("ProfileError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createProfileError({
      code: ProfileErrorCode.PROFILE_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProfileError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo ProfileError si ya lo es", () => {
    const original = createProfileError({
      code: ProfileErrorCode.PROFILE_VALIDATION_FAILED,
      message: "x",
      origin: "validation",
      recoverable: true,
    });
    const wrapped = ProfileError.wrap(original, {
      code: ProfileErrorCode.PROFILE_ACTIVATION_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = ProfileError.wrap(new Error("nativo"), {
      code: ProfileErrorCode.PROFILE_LOAD_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = ProfileError.wrap("cadena", {
      code: ProfileErrorCode.PROFILE_LOAD_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de perfiles");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createProfileError({
      code: ProfileErrorCode.PROFILE_SAVE_FAILED,
      message: "m",
      origin: "persistence",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "ProfileError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/profile)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof ProfileManager).toBe("function");
    expect(typeof ProfileRegistry).toBe("function");
    expect(typeof Profile).toBe("function");
  });
});
