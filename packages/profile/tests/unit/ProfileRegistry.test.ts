import { describe, it, expect } from "vitest";
import { ProfileRegistry } from "../../src/ProfileRegistry.js";
import { Profile } from "../../src/Profile.js";
import { createInitialProfileMetadata } from "../../src/ProfileMetadata.js";
import { defaultProfileConfiguration } from "../../src/ProfileConfiguration.js";
import { ProfileErrorCode } from "../../src/errors/ProfileErrorCode.js";

function makeProfile(id: string): Profile {
  return new Profile(
    createInitialProfileMetadata(id, `Perfil ${id}`, "desc"),
    defaultProfileConfiguration()
  );
}

describe("ProfileRegistry", () => {
  it("registra y consulta; list() ordena alfabéticamente", () => {
    const registry = new ProfileRegistry();
    registry.register(makeProfile("b"));
    registry.register(makeProfile("a"));
    expect(registry.list()).toEqual(["a", "b"]);
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new ProfileRegistry();
    registry.register(makeProfile("a"));
    expect(() => registry.register(makeProfile("a"))).toThrow(
      expect.objectContaining({ code: ProfileErrorCode.PROFILE_ALREADY_EXISTS })
    );
  });

  it("require() lanza PROFILE_NOT_FOUND si no existe", () => {
    const registry = new ProfileRegistry();
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: ProfileErrorCode.PROFILE_NOT_FOUND })
    );
  });

  it("setState() aplica transiciones válidas y rechaza las inválidas", () => {
    const registry = new ProfileRegistry();
    registry.register(makeProfile("a"));
    registry.setState("a", "active");
    expect(registry.get("a")?.state).toBe("active");
    expect(() => registry.setState("a", "created")).toThrow(
      expect.objectContaining({ code: ProfileErrorCode.PROFILE_INVALID_STATE_TRANSITION })
    );
  });

  it("setState('active') fija el perfil activo; desactivarlo lo limpia", () => {
    const registry = new ProfileRegistry();
    registry.register(makeProfile("a"));
    registry.setState("a", "active");
    expect(registry.getActiveId()).toBe("a");
    expect(registry.getActive()?.id).toBe("a");

    registry.setState("a", "inactive");
    expect(registry.getActiveId()).toBeNull();
    expect(registry.getActive()).toBeUndefined();
  });

  it("activar un segundo perfil no afecta al primero mientras ambos existan (gestión de exclusividad es responsabilidad del manager)", () => {
    const registry = new ProfileRegistry();
    registry.register(makeProfile("a"));
    registry.register(makeProfile("b"));
    registry.setState("a", "active");
    registry.setState("b", "active");
    expect(registry.getActiveId()).toBe("b");
  });

  it("unregister() elimina del registro y limpia el activo si era ese", () => {
    const registry = new ProfileRegistry();
    registry.register(makeProfile("a"));
    registry.setState("a", "active");
    registry.unregister("a");
    expect(registry.list()).toEqual([]);
    expect(registry.getActiveId()).toBeNull();
  });

  it("clear() vacía el registro y el activo", () => {
    const registry = new ProfileRegistry();
    registry.register(makeProfile("a"));
    registry.setState("a", "active");
    registry.clear();
    expect(registry.list()).toEqual([]);
    expect(registry.getActiveId()).toBeNull();
  });
});
