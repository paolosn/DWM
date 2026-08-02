import { describe, it, expect } from "vitest";
import { ProfileValidator } from "../../src/ProfileValidator.js";
import { defaultProfileConfiguration } from "../../src/ProfileConfiguration.js";
import { ProfileErrorCode } from "../../src/errors/ProfileErrorCode.js";

describe("ProfileValidator", () => {
  it("no lanza si no hay ningún gestor integrado (solo valida la forma)", async () => {
    const validator = new ProfileValidator();
    await expect(
      validator.validate({
        ...defaultProfileConfiguration(),
        workspaceId: "w1",
        enabledTools: ["t1"],
      })
    ).resolves.toBeUndefined();
  });

  it("lanza PROFILE_VALIDATION_FAILED si el workspace referenciado no está abierto", async () => {
    const workspaceManager = { getWorkspace: () => undefined };
    const validator = new ProfileValidator({ workspaceManager: workspaceManager as never });
    await expect(
      validator.validate({ ...defaultProfileConfiguration(), workspaceId: "w1" })
    ).rejects.toMatchObject({
      code: ProfileErrorCode.PROFILE_VALIDATION_FAILED,
    });
  });

  it("no lanza si el workspace referenciado está abierto", async () => {
    const workspaceManager = { getWorkspace: (id: string) => ({ id }) };
    const validator = new ProfileValidator({ workspaceManager: workspaceManager as never });
    await expect(
      validator.validate({ ...defaultProfileConfiguration(), workspaceId: "w1" })
    ).resolves.toBeUndefined();
  });

  it("lanza PROFILE_VALIDATION_FAILED si una herramienta habilitada no está registrada", async () => {
    const toolingManager = { getState: () => undefined };
    const validator = new ProfileValidator({ toolingManager: toolingManager as never });
    await expect(
      validator.validate({ ...defaultProfileConfiguration(), enabledTools: ["t1"] })
    ).rejects.toMatchObject({ code: ProfileErrorCode.PROFILE_VALIDATION_FAILED });
  });

  it("lanza PROFILE_VALIDATION_FAILED si un adaptador habilitado no está registrado", async () => {
    const adapterManager = { getState: () => undefined };
    const validator = new ProfileValidator({ adapterManager: adapterManager as never });
    await expect(
      validator.validate({ ...defaultProfileConfiguration(), enabledAdapters: ["a1"] })
    ).rejects.toMatchObject({ code: ProfileErrorCode.PROFILE_VALIDATION_FAILED });
  });

  it("lanza PROFILE_VALIDATION_FAILED si el proveedor de IA por defecto no está registrado", async () => {
    const aiManager = { getConnection: () => undefined };
    const validator = new ProfileValidator({ aiManager: aiManager as never });
    await expect(
      validator.validate({ ...defaultProfileConfiguration(), defaultAIProviderId: "p1" })
    ).rejects.toMatchObject({ code: ProfileErrorCode.PROFILE_VALIDATION_FAILED });
  });

  it("lanza PROFILE_VALIDATION_FAILED si un secreto referenciado no existe", async () => {
    const secretsManager = { hasSecret: async () => false };
    const validator = new ProfileValidator({ secretsManager: secretsManager as never });
    await expect(
      validator.validate({ ...defaultProfileConfiguration(), secretRefs: ["k1"] })
    ).rejects.toMatchObject({ code: ProfileErrorCode.PROFILE_VALIDATION_FAILED });
  });

  it("no lanza si todos los secretos referenciados existen", async () => {
    const secretsManager = { hasSecret: async () => true };
    const validator = new ProfileValidator({ secretsManager: secretsManager as never });
    await expect(
      validator.validate({ ...defaultProfileConfiguration(), secretRefs: ["k1"] })
    ).resolves.toBeUndefined();
  });
});
