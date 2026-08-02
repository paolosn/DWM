import { describe, it, expect } from "vitest";
import { MigrationValidator } from "../../src/MigrationValidator.js";
import { MigrationErrorCode } from "../../src/errors/MigrationErrorCode.js";

const EXPORT_BASE = {
  type: "full" as const,
  resources: [{ resourceType: "custom" as const, resourceId: "r1" }],
  target: { providerId: "local", path: "dest" },
};

describe("MigrationValidator — exportación", () => {
  it("valida una solicitud correcta", () => {
    const validator = new MigrationValidator();
    expect(validator.validateExportRequest(EXPORT_BASE).valid).toBe(true);
  });

  it("rechaza un tipo inválido", () => {
    const validator = new MigrationValidator();
    expect(validator.validateExportRequest({ ...EXPORT_BASE, type: "otro" as never }).valid).toBe(
      false
    );
  });

  it("rechaza resources vacío", () => {
    const validator = new MigrationValidator();
    expect(validator.validateExportRequest({ ...EXPORT_BASE, resources: [] }).valid).toBe(false);
  });

  it("rechaza target sin providerId o con ruta insegura", () => {
    const validator = new MigrationValidator();
    expect(
      validator.validateExportRequest({ ...EXPORT_BASE, target: { providerId: "", path: "dest" } })
        .valid
    ).toBe(false);
    expect(
      validator.validateExportRequest({
        ...EXPORT_BASE,
        target: { providerId: "local", path: "../fuera" },
      }).valid
    ).toBe(false);
  });

  it("una migración incremental requiere baseBackupId", () => {
    const validator = new MigrationValidator();
    expect(validator.validateExportRequest({ ...EXPORT_BASE, type: "incremental" }).valid).toBe(
      false
    );
    expect(
      validator.validateExportRequest({ ...EXPORT_BASE, type: "incremental", baseBackupId: "b0" })
        .valid
    ).toBe(true);
  });

  it("rechaza una solicitud que no es un objeto", () => {
    const validator = new MigrationValidator();
    const result = validator.validateExportRequest(null as never);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it("assertValidExportRequest lanza MIGRATION_INVALID_REQUEST", () => {
    const validator = new MigrationValidator();
    expect(() => validator.assertValidExportRequest({ ...EXPORT_BASE, resources: [] })).toThrow(
      expect.objectContaining({ code: MigrationErrorCode.MIGRATION_INVALID_REQUEST })
    );
    expect(() => validator.assertValidExportRequest(EXPORT_BASE)).not.toThrow();
  });
});

describe("MigrationValidator — importación", () => {
  it("valida una solicitud correcta", () => {
    const validator = new MigrationValidator();
    expect(validator.validateImportRequest({ backupId: "b1" }).valid).toBe(true);
  });

  it("rechaza backupId ausente", () => {
    const validator = new MigrationValidator();
    expect(validator.validateImportRequest({ backupId: "" }).valid).toBe(false);
  });

  it("rechaza resourceTypes mal formado", () => {
    const validator = new MigrationValidator();
    expect(
      validator.validateImportRequest({ backupId: "b1", resourceTypes: "x" as never }).valid
    ).toBe(false);
  });

  it("rechaza conflictStrategy desconocida", () => {
    const validator = new MigrationValidator();
    expect(
      validator.validateImportRequest({ backupId: "b1", conflictStrategy: "otra" as never }).valid
    ).toBe(false);
  });

  it("rechaza una solicitud que no es un objeto", () => {
    const validator = new MigrationValidator();
    const result = validator.validateImportRequest(null as never);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it("assertValidImportRequest lanza MIGRATION_INVALID_REQUEST", () => {
    const validator = new MigrationValidator();
    expect(() => validator.assertValidImportRequest({ backupId: "" })).toThrow(
      expect.objectContaining({ code: MigrationErrorCode.MIGRATION_INVALID_REQUEST })
    );
    expect(() => validator.assertValidImportRequest({ backupId: "b1" })).not.toThrow();
  });
});
