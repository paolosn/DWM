import { describe, it, expect } from "vitest";
import {
  isSafePackageEntryPath,
  assertSafePackageEntryPath,
  normalizeEntryPath,
  resolveSafeExtractionPath,
  isWithinAllowedRoot,
} from "../../src/PackagePathSafety.js";
import { PortablePackageError } from "../../src/errors/PortablePackageError.js";
import { PortablePackageErrorCode } from "../../src/errors/PortablePackageErrorCode.js";

describe("normalizeEntryPath", () => {
  it("convierte separadores de Windows a '/'", () => {
    expect(normalizeEntryPath("a\\b\\c.txt")).toBe("a/b/c.txt");
  });
});

describe("isSafePackageEntryPath", () => {
  it("acepta rutas relativas normales, incluidas Unicode y ocultas", () => {
    expect(isSafePackageEntryPath("config/app.json")).toBe(true);
    expect(isSafePackageEntryPath("nombre-con-ñ/archivo-日本語.txt")).toBe(true);
    expect(isSafePackageEntryPath(".dwm/workspace.json")).toBe(true);
    expect(isSafePackageEntryPath("a")).toBe(true);
  });

  it("rechaza rutas absolutas POSIX y Windows", () => {
    expect(isSafePackageEntryPath("/etc/passwd")).toBe(false);
    expect(isSafePackageEntryPath("C:\\Windows\\System32")).toBe(false);
    expect(isSafePackageEntryPath("D:/algo")).toBe(false);
  });

  it("rechaza path traversal (Zip Slip) en cualquier posición", () => {
    expect(isSafePackageEntryPath("../fuera.txt")).toBe(false);
    expect(isSafePackageEntryPath("config/../../fuera.txt")).toBe(false);
    expect(isSafePackageEntryPath("a/b/../../../etc/passwd")).toBe(false);
    expect(isSafePackageEntryPath(".")).toBe(false);
    expect(isSafePackageEntryPath("..")).toBe(false);
  });

  it("rechaza segmentos vacíos intermedios y bytes nulos", () => {
    expect(isSafePackageEntryPath("a//b")).toBe(false);
    expect(isSafePackageEntryPath("a/b\0c")).toBe(false);
    expect(isSafePackageEntryPath("")).toBe(false);
  });

  it("rechaza nombres reservados de Windows, con y sin extensión, sin distinguir mayúsculas", () => {
    expect(isSafePackageEntryPath("CON")).toBe(false);
    expect(isSafePackageEntryPath("con.txt")).toBe(false);
    expect(isSafePackageEntryPath("nul")).toBe(false);
    expect(isSafePackageEntryPath("COM1.log")).toBe(false);
    expect(isSafePackageEntryPath("carpeta/LPT9")).toBe(false);
    expect(isSafePackageEntryPath("normal.txt")).toBe(true);
  });

  it("rechaza rutas excesivamente largas o de tipo no string", () => {
    expect(isSafePackageEntryPath("a".repeat(5000))).toBe(false);
    expect(isSafePackageEntryPath(undefined as unknown as string)).toBe(false);
    expect(isSafePackageEntryPath(42 as unknown as string)).toBe(false);
  });
});

describe("assertSafePackageEntryPath", () => {
  it("no lanza para rutas seguras", () => {
    expect(() => assertSafePackageEntryPath("config/app.json")).not.toThrow();
  });

  it("lanza PACKAGE_UNSAFE_PATH para rutas inseguras", () => {
    expect(() => assertSafePackageEntryPath("../fuera.txt")).toThrowError(
      expect.objectContaining({ code: PortablePackageErrorCode.PACKAGE_UNSAFE_PATH })
    );
  });
});

describe("resolveSafeExtractionPath", () => {
  it("resuelve una ruta relativa segura dentro del destino", () => {
    const resolved = resolveSafeExtractionPath("/tmp/destino", "config/app.json");
    expect(resolved.endsWith("config/app.json") || resolved.includes("config")).toBe(true);
  });

  it("lanza PortablePackageError si la ruta es insegura por sí misma", () => {
    expect(() => resolveSafeExtractionPath("/tmp/destino", "../../etc/passwd")).toThrowError(
      expect.objectContaining({ code: PortablePackageErrorCode.PACKAGE_UNSAFE_PATH })
    );
  });

  it("lanza PortablePackageError para cualquier ruta insegura", () => {
    expect(() => resolveSafeExtractionPath("/tmp/destino", "/absoluta")).toThrowError(
      PortablePackageError
    );
  });
});

describe("isWithinAllowedRoot", () => {
  it("verdadero para la propia raíz y para rutas dentro de ella", () => {
    expect(isWithinAllowedRoot("/tmp/origen", "/tmp/origen")).toBe(true);
    expect(isWithinAllowedRoot("/tmp/origen", "/tmp/origen/sub/archivo.txt")).toBe(true);
  });

  it("falso para rutas fuera de la raíz, incluidas las que empiezan igual", () => {
    expect(isWithinAllowedRoot("/tmp/origen", "/tmp/otro")).toBe(false);
    expect(isWithinAllowedRoot("/tmp/origen", "/tmp/origen-otro")).toBe(false);
    expect(isWithinAllowedRoot("/tmp/origen", "/etc/passwd")).toBe(false);
  });
});
