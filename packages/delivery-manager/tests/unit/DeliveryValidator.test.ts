import { describe, it, expect } from "vitest";
import { DeliveryValidator } from "../../src/DeliveryValidator.js";
import { DeliveryErrorCode } from "../../src/errors/DeliveryErrorCode.js";
import type { DeliveryImportRequest } from "../../src/DeliveryTypes.js";

function baseRequest(): DeliveryImportRequest {
  return {
    projectId: "proyecto-1",
    projectPath: "/tmp/proyecto-1",
    sourceType: "folder",
    sourcePath: "/tmp/origen",
    label: "Inicial",
  };
}

describe("DeliveryValidator.assertValidImportRequest", () => {
  const validator = new DeliveryValidator();

  it("acepta una solicitud mínima válida", () => {
    expect(() => validator.assertValidImportRequest(baseRequest())).not.toThrow();
  });

  it("acepta una solicitud completa con todos los campos opcionales", () => {
    expect(() =>
      validator.assertValidImportRequest({
        ...baseRequest(),
        type: "backup",
        version: "1.0.2",
        notes: "todo correcto",
        deliveredAt: "2026-08-01T00:00:00.000Z",
      })
    ).not.toThrow();
  });

  it("rechaza una solicitud vacía", () => {
    expect(() => validator.assertValidImportRequest(undefined as never)).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_REQUEST })
    );
  });

  it("rechaza projectId vacío", () => {
    expect(() => validator.assertValidImportRequest({ ...baseRequest(), projectId: "" })).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_REQUEST })
    );
  });

  it("rechaza projectPath vacío", () => {
    expect(() => validator.assertValidImportRequest({ ...baseRequest(), projectPath: "" })).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_PROJECT_PATH })
    );
  });

  it("rechaza sourceType inválido", () => {
    expect(() =>
      validator.assertValidImportRequest({ ...baseRequest(), sourceType: "dwm-workspace" as never })
    ).toThrow(expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_SOURCE }));
  });

  it("rechaza sourcePath vacío", () => {
    expect(() => validator.assertValidImportRequest({ ...baseRequest(), sourcePath: "" })).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_SOURCE })
    );
  });

  it("rechaza label insegura", () => {
    expect(() => validator.assertValidImportRequest({ ...baseRequest(), label: "a/b" })).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_LABEL })
    );
  });

  it("rechaza type inválido", () => {
    expect(() =>
      validator.assertValidImportRequest({ ...baseRequest(), type: "invalido" as never })
    ).toThrow(expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_TYPE }));
  });

  it("rechaza version insegura", () => {
    expect(() => validator.assertValidImportRequest({ ...baseRequest(), version: "a/b" })).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_VERSION })
    );
  });

  it("rechaza notes demasiado largas", () => {
    expect(() =>
      validator.assertValidImportRequest({ ...baseRequest(), notes: "a".repeat(5001) })
    ).toThrow(expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_NOTES }));
  });

  it("rechaza deliveredAt no parseable", () => {
    expect(() =>
      validator.assertValidImportRequest({ ...baseRequest(), deliveredAt: "no-es-fecha" })
    ).toThrow(expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_REQUEST }));
  });
});

describe("DeliveryValidator.assertValidRecordStructure", () => {
  const validator = new DeliveryValidator();

  function validRecord(): Record<string, unknown> {
    return {
      id: "id-1",
      projectId: "proyecto-1",
      folderName: "2026-08-01 Inicial",
      label: "Inicial",
      type: "folder",
      state: "active",
      origin: "/tmp/origen",
      hash: "abc123",
      sizeBytes: 10,
      fileCount: 1,
      directoryCount: 0,
      deliveredAt: "2026-08-01T00:00:00.000Z",
      importedAt: "2026-08-01T00:00:00.000Z",
      dwm: {
        archived: false,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    };
  }

  it("acepta un registro con forma válida", () => {
    expect(() => validator.assertValidRecordStructure(validRecord(), "sidecar.json")).not.toThrow();
  });

  it("rechaza un valor que no es objeto", () => {
    expect(() => validator.assertValidRecordStructure(null, "sidecar.json")).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_STRUCTURE })
    );
  });

  it("rechaza un registro al que le falta un campo de cadena obligatorio", () => {
    const record = validRecord();
    delete record.hash;
    expect(() => validator.assertValidRecordStructure(record, "sidecar.json")).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_STRUCTURE })
    );
  });

  it("rechaza un registro con campos numéricos inválidos", () => {
    const record = { ...validRecord(), sizeBytes: "10" };
    expect(() => validator.assertValidRecordStructure(record, "sidecar.json")).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_STRUCTURE })
    );
  });

  it("rechaza un registro sin bloque dwm", () => {
    const record = validRecord();
    delete record.dwm;
    expect(() => validator.assertValidRecordStructure(record, "sidecar.json")).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_STRUCTURE })
    );
  });
});
