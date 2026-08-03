import { describe, it, expect } from "vitest";
import * as pkg from "../../src/index.js";
import {
  ProjectProvisioningError,
  createProjectProvisioningError,
} from "../../src/errors/ProjectProvisioningError.js";
import { ProjectProvisioningErrorCode } from "../../src/errors/ProjectProvisioningErrorCode.js";

describe("index.ts (barrel del paquete)", () => {
  it("exporta el servicio, los tipos y los errores principales", () => {
    expect(pkg.ProjectProvisioningService).toBeDefined();
    expect(pkg.ProjectProvisioningError).toBeDefined();
    expect(pkg.createProjectProvisioningError).toBeDefined();
    expect(pkg.ProjectProvisioningErrorCode).toBeDefined();
    expect(pkg.sanitizeProjectFolderName("Hola Mundo")).toBe("hola-mundo");
    expect(pkg.categoryFolderName("auditoria")).toBe("AUDITORIAS");
  });
});

describe("ProjectProvisioningError", () => {
  it("toJSON() expone code/message/origin/recoverable/timestamp", () => {
    const err = createProjectProvisioningError({
      code: ProjectProvisioningErrorCode.PROVISIONING_INVALID_REQUEST,
      message: "mensaje de prueba",
      origin: "request",
      recoverable: true,
    });
    const json = err.toJSON();
    expect(json).toMatchObject({
      name: "ProjectProvisioningError",
      code: ProjectProvisioningErrorCode.PROVISIONING_INVALID_REQUEST,
      message: "mensaje de prueba",
      origin: "request",
      recoverable: true,
    });
    expect(typeof json.timestamp).toBe("string");
  });

  it("wrap() envuelve un error ajeno una sola vez, y devuelve el mismo si ya es de este tipo", () => {
    const original = new Error("fallo original");
    const wrapped = ProjectProvisioningError.wrap(original, {
      code: ProjectProvisioningErrorCode.PROVISIONING_COPY_FAILED,
      origin: "copy",
      recoverable: true,
    });
    expect(wrapped.message).toBe("fallo original");
    expect(wrapped.cause).toBe(original);

    const rewrapped = ProjectProvisioningError.wrap(wrapped, {
      code: ProjectProvisioningErrorCode.PROVISIONING_ROLLBACK_FAILED,
      origin: "rollback",
      recoverable: false,
    });
    expect(rewrapped).toBe(wrapped);
  });

  it("wrap() usa un mensaje genérico cuando el error envuelto no es un Error", () => {
    const wrapped = ProjectProvisioningError.wrap("no soy un Error", {
      code: ProjectProvisioningErrorCode.PROVISIONING_COPY_FAILED,
      origin: "copy",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el aprovisionamiento de proyectos.");
  });
});
