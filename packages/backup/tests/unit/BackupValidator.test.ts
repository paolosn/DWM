import { describe, it, expect } from "vitest";
import { BackupValidator } from "../../src/BackupValidator.js";
import { BackupErrorCode } from "../../src/errors/BackupErrorCode.js";
import { makeRequest } from "./support/fixtures.js";

describe("BackupValidator", () => {
  it("valida una solicitud correcta (completa, selectiva e incremental)", () => {
    const validator = new BackupValidator();
    expect(validator.validateRequest(makeRequest()).valid).toBe(true);
    expect(validator.validateRequest(makeRequest({ type: "selective" })).valid).toBe(true);
    expect(
      validator.validateRequest(makeRequest({ type: "incremental", baseBackupId: "b0" })).valid
    ).toBe(true);
  });

  it("rechaza un tipo inválido", () => {
    const validator = new BackupValidator();
    expect(validator.validateRequest(makeRequest({ type: "otro" as never })).valid).toBe(false);
  });

  it("rechaza resources vacío o mal formado", () => {
    const validator = new BackupValidator();
    expect(validator.validateRequest(makeRequest({ resources: [] })).valid).toBe(false);
    expect(
      validator.validateRequest(
        makeRequest({ resources: [{ resourceType: "custom", resourceId: "" }] })
      ).valid
    ).toBe(false);
  });

  it("rechaza excludedPaths mal formado o inseguro", () => {
    const validator = new BackupValidator();
    expect(validator.validateRequest(makeRequest({ excludedPaths: "x" as never })).valid).toBe(
      false
    );
    expect(validator.validateRequest(makeRequest({ excludedPaths: ["../fuera"] })).valid).toBe(
      false
    );
  });

  it("rechaza target ausente o con ruta insegura", () => {
    const validator = new BackupValidator();
    expect(validator.validateRequest(makeRequest({ target: undefined as never })).valid).toBe(
      false
    );
    expect(
      validator.validateRequest(makeRequest({ target: { providerId: "local", path: "../fuera" } }))
        .valid
    ).toBe(false);
    expect(
      validator.validateRequest(makeRequest({ target: { providerId: "", path: "dest" } })).valid
    ).toBe(false);
  });

  it("un backup incremental requiere baseBackupId; los demás tipos lo rechazan", () => {
    const validator = new BackupValidator();
    expect(validator.validateRequest(makeRequest({ type: "incremental" })).valid).toBe(false);
    expect(validator.validateRequest(makeRequest({ type: "full", baseBackupId: "b0" })).valid).toBe(
      false
    );
  });

  it("rechaza una solicitud que no es un objeto", () => {
    const validator = new BackupValidator();
    const result = validator.validateRequest(null as never);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it("assertValidRequest lanza BACKUP_INVALID_REQUEST con los diagnósticos agregados", () => {
    const validator = new BackupValidator();
    expect(() => validator.assertValidRequest(makeRequest({ resources: [] }))).toThrow(
      expect.objectContaining({ code: BackupErrorCode.BACKUP_INVALID_REQUEST })
    );
  });

  it("assertValidRequest no lanza si la solicitud es válida", () => {
    const validator = new BackupValidator();
    expect(() => validator.assertValidRequest(makeRequest())).not.toThrow();
  });
});
