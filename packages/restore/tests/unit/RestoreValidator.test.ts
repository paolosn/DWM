import { describe, it, expect } from "vitest";
import { RestoreValidator } from "../../src/RestoreValidator.js";
import { RestoreErrorCode } from "../../src/errors/RestoreErrorCode.js";

describe("RestoreValidator", () => {
  it("valida una solicitud correcta", () => {
    const validator = new RestoreValidator();
    expect(validator.validateRequest({ backupId: "b1" }).valid).toBe(true);
  });

  it("rechaza backupId ausente", () => {
    const validator = new RestoreValidator();
    expect(validator.validateRequest({ backupId: "" }).valid).toBe(false);
  });

  it("rechaza resourceTypes mal formado", () => {
    const validator = new RestoreValidator();
    expect(validator.validateRequest({ backupId: "b1", resourceTypes: "x" as never }).valid).toBe(
      false
    );
  });

  it("rechaza targetOverride sin providerId o con ruta insegura", () => {
    const validator = new RestoreValidator();
    expect(
      validator.validateRequest({
        backupId: "b1",
        targetOverride: { providerId: "", path: "dest" },
      }).valid
    ).toBe(false);
    expect(
      validator.validateRequest({
        backupId: "b1",
        targetOverride: { providerId: "local", path: "../fuera" },
      }).valid
    ).toBe(false);
  });

  it("acepta targetOverride válido", () => {
    const validator = new RestoreValidator();
    expect(
      validator.validateRequest({
        backupId: "b1",
        targetOverride: { providerId: "local", path: "otro" },
      }).valid
    ).toBe(true);
  });

  it("rechaza una solicitud que no es un objeto", () => {
    const validator = new RestoreValidator();
    const result = validator.validateRequest(null as never);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it("assertValidRequest lanza RESTORE_INVALID_REQUEST con los diagnósticos agregados", () => {
    const validator = new RestoreValidator();
    expect(() => validator.assertValidRequest({ backupId: "" })).toThrow(
      expect.objectContaining({ code: RestoreErrorCode.RESTORE_INVALID_REQUEST })
    );
  });

  it("assertValidRequest no lanza si la solicitud es válida", () => {
    const validator = new RestoreValidator();
    expect(() => validator.assertValidRequest({ backupId: "b1" })).not.toThrow();
  });
});
