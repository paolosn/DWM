import { describe, it, expect } from "vitest";
import { isProfileStateTransitionAllowed } from "../../src/ProfileState.js";
import {
  validateProfileConfiguration,
  defaultProfileConfiguration,
} from "../../src/ProfileConfiguration.js";
import { createInitialProfileMetadata, touchProfileMetadata } from "../../src/ProfileMetadata.js";
import { ProfileErrorCode } from "../../src/errors/ProfileErrorCode.js";

describe("isProfileStateTransitionAllowed", () => {
  it("permite el ciclo de vida normal", () => {
    expect(isProfileStateTransitionAllowed("created", "active")).toBe(true);
    expect(isProfileStateTransitionAllowed("active", "inactive")).toBe(true);
    expect(isProfileStateTransitionAllowed("inactive", "active")).toBe(true);
    expect(isProfileStateTransitionAllowed("active", "deleted")).toBe(true);
  });

  it("rechaza transiciones no permitidas", () => {
    expect(isProfileStateTransitionAllowed("deleted", "active")).toBe(false);
    expect(isProfileStateTransitionAllowed("created", "created")).toBe(false);
  });
});

describe("validateProfileConfiguration", () => {
  it("acepta la configuración por defecto", () => {
    expect(() => validateProfileConfiguration(defaultProfileConfiguration())).not.toThrow();
  });

  it("rechaza config ausente", () => {
    expect(() => validateProfileConfiguration(null as never)).toThrow(
      expect.objectContaining({ code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION })
    );
  });

  it("rechaza enabledTools/enabledAdapters/secretRefs que no sean arrays de cadenas", () => {
    expect(() =>
      validateProfileConfiguration({ ...defaultProfileConfiguration(), enabledTools: "x" as never })
    ).toThrow(expect.objectContaining({ code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION }));
    expect(() =>
      validateProfileConfiguration({
        ...defaultProfileConfiguration(),
        enabledAdapters: [1] as never,
      })
    ).toThrow(expect.objectContaining({ code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION }));
    expect(() =>
      validateProfileConfiguration({ ...defaultProfileConfiguration(), secretRefs: {} as never })
    ).toThrow(expect.objectContaining({ code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION }));
  });

  it("rechaza workspaceId/defaultAIProviderId que no sean cadenas si se indican", () => {
    expect(() =>
      validateProfileConfiguration({ ...defaultProfileConfiguration(), workspaceId: 1 as never })
    ).toThrow(expect.objectContaining({ code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION }));
    expect(() =>
      validateProfileConfiguration({
        ...defaultProfileConfiguration(),
        defaultAIProviderId: 1 as never,
      })
    ).toThrow(expect.objectContaining({ code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION }));
  });

  it("acepta agentIds/skillIds/ruleIds/mcpConnectionIds reales (encargo item 5: perfil como paquete)", () => {
    expect(() =>
      validateProfileConfiguration({
        ...defaultProfileConfiguration(),
        agentIds: ["coordinador"],
        skillIds: ["checklist-produccion"],
        ruleIds: ["seguridad-codigo"],
        mcpConnectionIds: ["mcp-github"],
      })
    ).not.toThrow();
  });

  it("lanza PROFILE_INVALID_CONFIGURATION si agentIds no es un array de cadenas", () => {
    expect(() =>
      validateProfileConfiguration({ ...defaultProfileConfiguration(), agentIds: [1] as never })
    ).toThrow(expect.objectContaining({ code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION }));
  });
});

describe("ProfileMetadata", () => {
  it("createInitialProfileMetadata fija createdAt=updatedAt", () => {
    const metadata = createInitialProfileMetadata("id1", "Nombre", "Descripción");
    expect(metadata.createdAt).toBe(metadata.updatedAt);
  });

  it("touchProfileMetadata actualiza updatedAt preservando el resto", async () => {
    const metadata = createInitialProfileMetadata("id1", "Nombre", "Descripción");
    await new Promise((r) => setTimeout(r, 5));
    const touched = touchProfileMetadata(metadata);
    expect(touched.updatedAt).not.toBe(metadata.updatedAt);
    expect(touched.id).toBe(metadata.id);
  });
});
