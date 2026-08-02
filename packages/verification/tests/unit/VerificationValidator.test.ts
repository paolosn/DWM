import { describe, it, expect } from "vitest";
import { VerificationValidator } from "../../src/VerificationValidator.js";
import { VerificationErrorCode } from "../../src/errors/VerificationErrorCode.js";

describe("VerificationValidator", () => {
  it("valida una solicitud vacía (verificación completa)", () => {
    const validator = new VerificationValidator();
    expect(validator.validateRequest({}).valid).toBe(true);
  });

  it("valida una solicitud selectiva correcta", () => {
    const validator = new VerificationValidator();
    expect(validator.validateRequest({ categories: ["projects", "backups"] }).valid).toBe(true);
  });

  it("rechaza categories vacío o mal formado", () => {
    const validator = new VerificationValidator();
    expect(validator.validateRequest({ categories: [] }).valid).toBe(false);
    expect(validator.validateRequest({ categories: "x" as never }).valid).toBe(false);
  });

  it("rechaza una categoría desconocida", () => {
    const validator = new VerificationValidator();
    expect(validator.validateRequest({ categories: ["no-existe" as never] }).valid).toBe(false);
  });

  it("rechaza dryRun no booleano", () => {
    const validator = new VerificationValidator();
    expect(validator.validateRequest({ dryRun: "si" as never }).valid).toBe(false);
  });

  it("rechaza una solicitud que no es un objeto", () => {
    const validator = new VerificationValidator();
    const result = validator.validateRequest(null as never);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it("assertValidRequest lanza VERIFICATION_INVALID_REQUEST", () => {
    const validator = new VerificationValidator();
    expect(() => validator.assertValidRequest({ categories: [] })).toThrow(
      expect.objectContaining({ code: VerificationErrorCode.VERIFICATION_INVALID_REQUEST })
    );
    expect(() => validator.assertValidRequest({})).not.toThrow();
  });
});
