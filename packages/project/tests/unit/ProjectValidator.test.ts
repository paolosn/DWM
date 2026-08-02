import { describe, it, expect } from "vitest";
import { ProjectValidator } from "../../src/ProjectValidator.js";
import { ProjectErrorCode } from "../../src/errors/ProjectErrorCode.js";

const BASE = { projectPath: "/tmp/x", profileId: "p1", usedTools: [], usedAdapters: [] };

describe("ProjectValidator", () => {
  it("no lanza si no hay ningún gestor integrado (solo valida la forma)", async () => {
    const validator = new ProjectValidator();
    await expect(validator.validate(BASE)).resolves.toBeUndefined();
  });

  it("lanza PROJECT_VALIDATION_FAILED si el perfil asociado no está registrado", async () => {
    const profileManager = { getProfile: () => undefined };
    const validator = new ProjectValidator({ profileManager: profileManager as never });
    await expect(validator.validate(BASE)).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_VALIDATION_FAILED,
    });
  });

  it("no lanza si el perfil asociado está registrado", async () => {
    const profileManager = { getProfile: (id: string) => ({ id }) };
    const validator = new ProjectValidator({ profileManager: profileManager as never });
    await expect(validator.validate(BASE)).resolves.toBeUndefined();
  });

  it("lanza PROJECT_VALIDATION_FAILED si el workspace referenciado no está abierto", async () => {
    const workspaceManager = { getWorkspace: () => undefined };
    const validator = new ProjectValidator({ workspaceManager: workspaceManager as never });
    await expect(validator.validate({ ...BASE, workspaceId: "w1" })).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_VALIDATION_FAILED,
    });
  });

  it("no lanza si el workspace referenciado está abierto", async () => {
    const workspaceManager = { getWorkspace: (id: string) => ({ id }) };
    const validator = new ProjectValidator({ workspaceManager: workspaceManager as never });
    await expect(validator.validate({ ...BASE, workspaceId: "w1" })).resolves.toBeUndefined();
  });

  it("lanza PROJECT_VALIDATION_FAILED si una herramienta utilizada no está registrada", async () => {
    const toolingManager = { getState: () => undefined };
    const validator = new ProjectValidator({ toolingManager: toolingManager as never });
    await expect(validator.validate({ ...BASE, usedTools: ["t1"] })).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_VALIDATION_FAILED,
    });
  });

  it("lanza PROJECT_VALIDATION_FAILED si un adaptador utilizado no está registrado", async () => {
    const adapterManager = { getState: () => undefined };
    const validator = new ProjectValidator({ adapterManager: adapterManager as never });
    await expect(validator.validate({ ...BASE, usedAdapters: ["a1"] })).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_VALIDATION_FAILED,
    });
  });
});
