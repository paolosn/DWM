import { describe, it, expect } from "vitest";
import { ConnectionValidator } from "../../src/ConnectionValidator.js";
import { ConnectionErrorCode } from "../../src/errors/ConnectionErrorCode.js";

describe("ConnectionValidator", () => {
  const validator: ConnectionValidator = new ConnectionValidator();

  it("assertValidProjectPath() rechaza rutas vacías", () => {
    try {
      validator.assertValidProjectPath("");
      throw new Error("no debía llegar aquí");
    } catch (err) {
      expect((err as { code: string }).code).toBe(
        ConnectionErrorCode.CONNECTION_INVALID_PROJECT_PATH
      );
    }
  });

  it("assertValidCreateRequest() rechaza tipos de conexión desconocidos", () => {
    expect(() =>
      validator.assertValidCreateRequest({
        projectId: "proj-1",
        name: "Mi conexión",
        // @ts-expect-error tipo inválido a propósito
        type: "not-a-real-type",
      })
    ).toThrowError();
  });

  it("assertValidCreateRequest() rechaza nombres con separadores de ruta", () => {
    expect(() =>
      validator.assertValidCreateRequest({
        projectId: "proj-1",
        name: "../etc/passwd",
        type: "http",
      })
    ).toThrowError();
  });

  it("assertValidCreateRequest() acepta una petición válida", () => {
    expect(() =>
      validator.assertValidCreateRequest({
        projectId: "proj-1",
        name: "WordPress Producción",
        type: "wordpress-rest",
      })
    ).not.toThrow();
  });

  it("assertValidCapabilities() exige el formato recurso.accion", () => {
    expect(() => validator.assertValidCapabilities(["posts.read"])).not.toThrow();
    expect(() => validator.assertValidCapabilities(["invalida"])).toThrowError();
  });

  it("assertValidId() rechaza identificadores no seguros y acepta identificadores válidos", () => {
    expect(() => validator.assertValidId("../etc/passwd")).toThrowError();
    expect(() => validator.assertValidId("conn-1")).not.toThrow();
  });

  it("assertValidProjectId() rechaza identificadores no seguros y acepta identificadores válidos", () => {
    expect(() => validator.assertValidProjectId("")).toThrowError();
    expect(() => validator.assertValidProjectId("proj-1")).not.toThrow();
  });

  it("assertValidCreateRequest() valida las capacidades cuando se incluyen", () => {
    expect(() =>
      validator.assertValidCreateRequest({
        projectId: "proj-1",
        name: "API",
        type: "http",
        capabilities: ["invalida"],
      })
    ).toThrowError();
  });

  it("assertValidUpdateRequest() acepta una petición vacía y rechaza nombre/capacidades inválidos", () => {
    expect(() => validator.assertValidUpdateRequest({})).not.toThrow();
    expect(() => validator.assertValidUpdateRequest({ name: "../etc/passwd" })).toThrowError();
    expect(() => validator.assertValidUpdateRequest({ capabilities: ["invalida"] })).toThrowError();
    expect(() => validator.assertValidUpdateRequest({ name: "Nuevo nombre" })).not.toThrow();
  });
});
