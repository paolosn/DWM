import { describe, it, expect } from "vitest";
import { isProjectStateTransitionAllowed } from "../../src/ProjectState.js";
import { validateProjectConfiguration } from "../../src/ProjectConfiguration.js";
import { createInitialProjectMetadata, touchProjectMetadata } from "../../src/ProjectMetadata.js";
import { ProjectErrorCode } from "../../src/errors/ProjectErrorCode.js";

const VALID = { projectPath: "/tmp/proyecto", profileId: "p1", usedTools: [], usedAdapters: [] };

describe("isProjectStateTransitionAllowed", () => {
  it("permite el ciclo de vida normal", () => {
    expect(isProjectStateTransitionAllowed("created", "open")).toBe(true);
    expect(isProjectStateTransitionAllowed("open", "closed")).toBe(true);
    expect(isProjectStateTransitionAllowed("closed", "open")).toBe(true);
    expect(isProjectStateTransitionAllowed("open", "deleted")).toBe(true);
  });

  it("rechaza transiciones no permitidas", () => {
    expect(isProjectStateTransitionAllowed("deleted", "open")).toBe(false);
    expect(isProjectStateTransitionAllowed("created", "created")).toBe(false);
  });
});

describe("validateProjectConfiguration", () => {
  it("acepta una configuración válida", () => {
    expect(() => validateProjectConfiguration(VALID)).not.toThrow();
  });

  it("rechaza config ausente", () => {
    expect(() => validateProjectConfiguration(null as never)).toThrow(
      expect.objectContaining({ code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION })
    );
  });

  it("rechaza projectPath vacío o ausente", () => {
    expect(() => validateProjectConfiguration({ ...VALID, projectPath: "" })).toThrow(
      expect.objectContaining({ code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION })
    );
  });

  it("rechaza profileId vacío o ausente (asociación obligatoria a un perfil)", () => {
    expect(() => validateProjectConfiguration({ ...VALID, profileId: "" })).toThrow(
      expect.objectContaining({ code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION })
    );
    expect(() => validateProjectConfiguration({ ...VALID, profileId: undefined as never })).toThrow(
      expect.objectContaining({ code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION })
    );
  });

  it("rechaza usedTools/usedAdapters que no sean arrays de cadenas", () => {
    expect(() => validateProjectConfiguration({ ...VALID, usedTools: "x" as never })).toThrow(
      expect.objectContaining({ code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION })
    );
    expect(() => validateProjectConfiguration({ ...VALID, usedAdapters: [1] as never })).toThrow(
      expect.objectContaining({ code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION })
    );
  });

  it("rechaza workspaceId que no sea una cadena si se indica", () => {
    expect(() => validateProjectConfiguration({ ...VALID, workspaceId: 1 as never })).toThrow(
      expect.objectContaining({ code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION })
    );
  });
});

describe("ProjectMetadata", () => {
  it("createInitialProjectMetadata fija createdAt=updatedAt", () => {
    const metadata = createInitialProjectMetadata("id1", "Nombre", "Descripción");
    expect(metadata.createdAt).toBe(metadata.updatedAt);
  });

  it("touchProjectMetadata actualiza updatedAt preservando el resto", async () => {
    const metadata = createInitialProjectMetadata("id1", "Nombre", "Descripción");
    await new Promise((r) => setTimeout(r, 5));
    const touched = touchProjectMetadata(metadata);
    expect(touched.updatedAt).not.toBe(metadata.updatedAt);
    expect(touched.id).toBe(metadata.id);
  });
});
