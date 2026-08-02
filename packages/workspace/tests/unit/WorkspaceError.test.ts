import { describe, it, expect } from "vitest";
import {
  WorkspaceError,
  createWorkspaceError,
  WorkspaceErrorCode,
  WorkspaceManager,
  WorkspaceRegistry,
  WorkspaceScanner,
  WorkspaceLoader,
  Workspace,
  createInitialMetadata,
  touchMetadata,
} from "../../src/index.js";

describe("WorkspaceError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createWorkspaceError({
      code: WorkspaceErrorCode.WORKSPACE_INVALID_PATH,
      message: "m",
      origin: "path",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("WorkspaceError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo WorkspaceError si ya lo es", () => {
    const original = createWorkspaceError({
      code: WorkspaceErrorCode.WORKSPACE_NOT_FOUND,
      message: "x",
      origin: "registry",
      recoverable: true,
    });
    const wrapped = WorkspaceError.wrap(original, {
      code: WorkspaceErrorCode.WORKSPACE_SCAN_FAILED,
      origin: "scan",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = WorkspaceError.wrap(new Error("nativo"), {
      code: WorkspaceErrorCode.WORKSPACE_SCAN_FAILED,
      origin: "scan",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = WorkspaceError.wrap("cadena", {
      code: WorkspaceErrorCode.WORKSPACE_SCAN_FAILED,
      origin: "scan",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el espacio de trabajo");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createWorkspaceError({
      code: WorkspaceErrorCode.WORKSPACE_CLOSED,
      message: "m",
      origin: "lifecycle",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "WorkspaceError", recoverable: true });
  });
});

describe("WorkspaceMetadata", () => {
  it("createInitialMetadata fija createdAt y updatedAt iguales", () => {
    const metadata = createInitialMetadata("id1", "Nombre", "/tmp/x");
    expect(metadata.createdAt).toBe(metadata.updatedAt);
    expect(metadata.id).toBe("id1");
  });

  it("touchMetadata actualiza updatedAt preservando el resto", async () => {
    const metadata = createInitialMetadata("id1", "Nombre", "/tmp/x");
    await new Promise((r) => setTimeout(r, 5));
    const touched = touchMetadata(metadata);
    expect(touched.updatedAt).not.toBe(metadata.updatedAt);
    expect(touched.id).toBe(metadata.id);
    expect(touched.createdAt).toBe(metadata.createdAt);
  });
});

describe("Punto de entrada público (@dwm/workspace)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof WorkspaceManager).toBe("function");
    expect(typeof WorkspaceRegistry).toBe("function");
    expect(typeof WorkspaceScanner).toBe("function");
    expect(typeof WorkspaceLoader).toBe("function");
    expect(typeof Workspace).toBe("function");
  });
});
