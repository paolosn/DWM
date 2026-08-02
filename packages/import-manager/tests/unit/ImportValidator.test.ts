import { describe, it, expect } from "vitest";
import { ImportValidator } from "../../src/ImportValidator.js";
import { ImportErrorCode } from "../../src/errors/ImportErrorCode.js";
import type { ImportScanResult } from "../../src/ImportTypes.js";

function scanOf(entries: Array<{ relativePath: string; size: number }>): ImportScanResult {
  return {
    entries: entries.map((e) => ({ ...e, mtimeMs: 0, isHidden: false })),
    directories: [],
    fileCount: entries.length,
    directoryCount: 0,
    signature: entries.map((e) => e.relativePath).join(","),
    scannedAt: 0,
  };
}

describe("ImportValidator.validateRequest", () => {
  const validator = new ImportValidator();

  it("acepta una solicitud mínima válida", () => {
    const result = validator.validateRequest({ sourceType: "folder", sourcePath: "/tmp/x" });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rechaza un objeto vacío o nulo", () => {
    expect(validator.validateRequest(null as never).valid).toBe(false);
  });

  it("rechaza sourceType inválido", () => {
    const result = validator.validateRequest({
      sourceType: "otro" as never,
      sourcePath: "/tmp/x",
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.field).toBe("sourceType");
  });

  it("rechaza sourcePath vacío o ausente", () => {
    const result = validator.validateRequest({ sourceType: "folder", sourcePath: "" });
    expect(result.valid).toBe(false);
  });

  it("rechaza destinationRelativePath inseguro", () => {
    const result = validator.validateRequest({
      sourceType: "folder",
      sourcePath: "/tmp/x",
      destinationRelativePath: "../fuera",
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "destinationRelativePath")).toBe(true);
  });

  it("rechaza destinationPath vacío si se indica", () => {
    const result = validator.validateRequest({
      sourceType: "folder",
      sourcePath: "/tmp/x",
      destinationPath: "",
    });
    expect(result.valid).toBe(false);
  });

  it("rechaza excludePatterns que no sea un array", () => {
    const result = validator.validateRequest({
      sourceType: "folder",
      sourcePath: "/tmp/x",
      excludePatterns: "no-array" as never,
    });
    expect(result.valid).toBe(false);
  });

  it("assertValidRequest() lanza IMPORT_INVALID_REQUEST si es inválida", () => {
    expect(() =>
      validator.assertValidRequest({ sourceType: "x" as never, sourcePath: "" })
    ).toThrowError(expect.objectContaining({ code: ImportErrorCode.IMPORT_INVALID_REQUEST }));
  });

  it("assertValidRequest() no lanza si es válida", () => {
    expect(() =>
      validator.assertValidRequest({ sourceType: "folder", sourcePath: "/tmp/x" })
    ).not.toThrow();
  });
});

describe("ImportValidator.validateIntegrity", () => {
  const validator = new ImportValidator();

  it("es válida cuando origen y copia coinciden exactamente", () => {
    const source = scanOf([{ relativePath: "a.txt", size: 1 }]);
    const result = validator.validateIntegrity(source, source);
    expect(result.valid).toBe(true);
  });

  it("detecta un recuento de ficheros distinto", () => {
    const source = scanOf([{ relativePath: "a.txt", size: 1 }]);
    const copied = scanOf([]);
    const result = validator.validateIntegrity(source, copied);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "fileCount")).toBe(true);
  });

  it("detecta un fichero faltante en el destino", () => {
    const source = scanOf([
      { relativePath: "a.txt", size: 1 },
      { relativePath: "b.txt", size: 2 },
    ]);
    const copied = scanOf([{ relativePath: "a.txt", size: 1 }]);
    const result = validator.validateIntegrity(source, copied);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("b.txt"))).toBe(true);
  });

  it("detecta un fichero que cambió de tamaño", () => {
    const source = scanOf([{ relativePath: "a.txt", size: 1 }]);
    const copied = scanOf([{ relativePath: "a.txt", size: 99 }]);
    const result = validator.validateIntegrity(source, copied);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("cambió de tamaño"))).toBe(true);
  });

  it("detecta discrepancia de firma cuando no hay otros issues", () => {
    const source: ImportScanResult = { ...scanOf([]), signature: "sig-a" };
    const copied: ImportScanResult = { ...scanOf([]), signature: "sig-b" };
    const result = validator.validateIntegrity(source, copied);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "signature")).toBe(true);
  });

  it("assertIntegrity() lanza IMPORT_INTEGRITY_MISMATCH si no es íntegra", () => {
    const source = scanOf([{ relativePath: "a.txt", size: 1 }]);
    const copied = scanOf([]);
    expect(() => validator.assertIntegrity(source, copied)).toThrowError(
      expect.objectContaining({ code: ImportErrorCode.IMPORT_INTEGRITY_MISMATCH })
    );
  });

  it("assertIntegrity() no lanza si es íntegra", () => {
    const source = scanOf([{ relativePath: "a.txt", size: 1 }]);
    expect(() => validator.assertIntegrity(source, source)).not.toThrow();
  });
});
