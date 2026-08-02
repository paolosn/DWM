import { describe, it, expect, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ImportScanner } from "../../src/ImportScanner.js";
import { ImportErrorCode } from "../../src/errors/ImportErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeSampleSourceTree, makeSampleZip } from "./support/fixtures.js";
import { writeRawZip } from "./support/rawZip.js";

describe("ImportScanner", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("scanFolder() descubre ficheros ocultos, carpetas anidadas y carpetas vacías", async () => {
    const root = tempDir();
    await makeSampleSourceTree(root);

    const scanner = new ImportScanner();
    const result = await scanner.scanFolder(root);

    const paths = result.entries.map((e) => e.relativePath);
    expect(paths).toContain(".env");
    expect(paths).toContain(".kilo/agents/agente.json");
    expect(paths).toContain("clientes/acme/auditoria.txt");
    expect(result.directories).toContain("carpeta-vacia");
    expect(result.directories).toContain(".kilo");
    expect(result.directoryCount).toBe(result.directories.length);
    expect(result.fileCount).toBe(result.entries.length);
    expect(typeof result.signature).toBe("string");
  });

  it("scanFolder() respeta excludePatterns sin omitir nada por defecto", async () => {
    const root = tempDir();
    await makeSampleSourceTree(root);

    const scanner = new ImportScanner();
    const withExclusion = await scanner.scanFolder(root, ["clientes/**"]);
    expect(withExclusion.entries.map((e) => e.relativePath)).not.toContain(
      "clientes/acme/auditoria.txt"
    );

    const withoutExclusion = await scanner.scanFolder(root, []);
    expect(withoutExclusion.entries.map((e) => e.relativePath)).toContain(
      "clientes/acme/auditoria.txt"
    );
  });

  it("scanFolder() captura symlinks con su destino y modo", async () => {
    const root = tempDir();
    await makeSampleSourceTree(root);
    await fs.symlink(path.join(root, "readme.md"), path.join(root, "enlace.md"));

    const scanner = new ImportScanner();
    const result = await scanner.scanFolder(root);
    const link = result.entries.find((e) => e.relativePath === "enlace.md");
    expect(link).toBeDefined();
    expect(link?.symlinkTarget).toBe(path.join(root, "readme.md"));
  });

  it("scanFolder() lanza IMPORT_SOURCE_NOT_FOUND si la carpeta no existe", async () => {
    const scanner = new ImportScanner();
    await expect(scanner.scanFolder(`${tempDir()}/no-existe`)).rejects.toMatchObject({
      code: ImportErrorCode.IMPORT_SOURCE_NOT_FOUND,
    });
  });

  it("scanFolder() lanza IMPORT_SOURCE_NOT_FOUND si la ruta no es una carpeta", async () => {
    const root = tempDir();
    const filePath = path.join(root, "fichero.txt");
    await fs.writeFile(filePath, "x");
    const scanner = new ImportScanner();
    await expect(scanner.scanFolder(filePath)).rejects.toMatchObject({
      code: ImportErrorCode.IMPORT_SOURCE_NOT_FOUND,
    });
  });

  it("scan('zip', ...) enumera las entradas del ZIP", async () => {
    const root = tempDir();
    await makeSampleSourceTree(root);
    const zipPath = path.join(tempDir(), "origen.zip");
    await makeSampleZip(zipPath, root);

    const scanner = new ImportScanner();
    const result = await scanner.scan("zip", zipPath);
    const paths = result.entries.map((e) => e.relativePath);
    expect(paths).toContain(".env");
    expect(paths).toContain("clientes/acme/auditoria.txt");
    expect(result.entries.every((e) => e.mode === undefined)).toBe(true);
  });

  it("scan('zip', ...) lanza IMPORT_SOURCE_NOT_FOUND si el fichero no existe", async () => {
    const scanner = new ImportScanner();
    await expect(scanner.scan("zip", `${tempDir()}/no-existe.zip`)).rejects.toMatchObject({
      code: ImportErrorCode.IMPORT_SOURCE_NOT_FOUND,
    });
  });

  it("scan('zip', ...) lanza IMPORT_SOURCE_NOT_FOUND si la ruta no es un fichero", async () => {
    const scanner = new ImportScanner();
    await expect(scanner.scan("zip", tempDir())).rejects.toMatchObject({
      code: ImportErrorCode.IMPORT_SOURCE_NOT_FOUND,
    });
  });

  it("scan('zip', ...) lanza IMPORT_SCAN_FAILED ante un ZIP corrupto", async () => {
    const root = tempDir();
    const brokenZip = path.join(root, "roto.zip");
    await fs.writeFile(brokenZip, "no soy un zip");
    const scanner = new ImportScanner();
    await expect(scanner.scan("zip", brokenZip)).rejects.toMatchObject({
      code: ImportErrorCode.IMPORT_SCAN_FAILED,
    });
  });

  it('scan("dwm-workspace", ...) se comporta como scanFolder()', async () => {
    const root = tempDir();
    await makeSampleSourceTree(root);
    const scanner = new ImportScanner();
    const result = await scanner.scan("dwm-workspace", root);
    expect(result.fileCount).toBeGreaterThan(0);
  });

  describe("seguridad: Zip Slip / path traversal / symlinks peligrosos", () => {
    it("scan('zip', ...) rechaza una entrada con path traversal (../) como IMPORT_UNSAFE_PATH", async () => {
      const zipPath = path.join(tempDir(), "zip-slip.zip");
      await writeRawZip(zipPath, [
        { name: "normal.txt", content: Buffer.from("ok") },
        { name: "../../evil.txt", content: Buffer.from("pwned") },
      ]);
      const scanner = new ImportScanner();
      await expect(scanner.scan("zip", zipPath)).rejects.toMatchObject({
        code: ImportErrorCode.IMPORT_UNSAFE_PATH,
      });
    });

    it("scan('zip', ...) rechaza una entrada con ruta absoluta POSIX", async () => {
      const zipPath = path.join(tempDir(), "abs-slip.zip");
      await writeRawZip(zipPath, [{ name: "/etc/passwd", content: Buffer.from("pwned") }]);
      const scanner = new ImportScanner();
      await expect(scanner.scan("zip", zipPath)).rejects.toMatchObject({
        code: ImportErrorCode.IMPORT_UNSAFE_PATH,
      });
    });

    it("scan('zip', ...) rechaza una entrada con ruta absoluta de unidad Windows", async () => {
      const zipPath = path.join(tempDir(), "win-slip.zip");
      await writeRawZip(zipPath, [
        { name: "C:\\Windows\\system.ini", content: Buffer.from("pwned") },
      ]);
      const scanner = new ImportScanner();
      await expect(scanner.scan("zip", zipPath)).rejects.toMatchObject({
        code: ImportErrorCode.IMPORT_UNSAFE_PATH,
      });
    });

    it("scan('zip', ...) acepta rutas anidadas legítimas sin falsos positivos", async () => {
      const zipPath = path.join(tempDir(), "legit.zip");
      await writeRawZip(zipPath, [
        { name: "clientes/acme/notas..raras/archivo.txt", content: Buffer.from("ok") },
      ]);
      const scanner = new ImportScanner();
      const result = await scanner.scan("zip", zipPath);
      expect(result.entries.map((e) => e.relativePath)).toContain(
        "clientes/acme/notas..raras/archivo.txt"
      );
    });

    it("scanFolder() rechaza un symlink cuyo destino escapa del origen (symlink peligroso)", async () => {
      const root = tempDir();
      await makeSampleSourceTree(root);
      const outside = tempDir();
      await fs.writeFile(path.join(outside, "secreto.txt"), "fuera del origen");
      await fs.symlink(path.join(outside, "secreto.txt"), path.join(root, "enlace-peligroso.md"));

      const scanner = new ImportScanner();
      await expect(scanner.scanFolder(root)).rejects.toMatchObject({
        code: ImportErrorCode.IMPORT_UNSAFE_PATH,
      });
    });

    it("scanFolder() rechaza un symlink relativo que escapa del origen con ../", async () => {
      const root = tempDir();
      await makeSampleSourceTree(root);
      const outside = tempDir();
      await fs.writeFile(path.join(outside, "secreto.txt"), "fuera del origen");
      const relativeEscape = path.relative(root, path.join(outside, "secreto.txt"));
      await fs.symlink(relativeEscape, path.join(root, "enlace-relativo-peligroso.md"));

      const scanner = new ImportScanner();
      await expect(scanner.scanFolder(root)).rejects.toMatchObject({
        code: ImportErrorCode.IMPORT_UNSAFE_PATH,
      });
    });

    it("scanFolder() sigue aceptando symlinks internos legítimos (sin falsos positivos)", async () => {
      const root = tempDir();
      await makeSampleSourceTree(root);
      await fs.symlink("readme.md", path.join(root, "enlace-relativo-seguro.md"));

      const scanner = new ImportScanner();
      const result = await scanner.scanFolder(root);
      const link = result.entries.find((e) => e.relativePath === "enlace-relativo-seguro.md");
      expect(link).toBeDefined();
    });
  });

  describe("compatibilidad: Unicode y rutas largas", () => {
    it("scanFolder() captura nombres Unicode (acentos, ñ, emoji, CJK) sin alterarlos", async () => {
      const root = tempDir();
      await fs.mkdir(path.join(root, "clientes", "año-2026"), { recursive: true });
      await fs.writeFile(
        path.join(root, "clientes", "año-2026", "auditoría-señor-😀-顧客.txt"),
        "ok",
        "utf-8"
      );

      const scanner = new ImportScanner();
      const result = await scanner.scanFolder(root);
      expect(result.entries.map((e) => e.relativePath)).toContain(
        "clientes/año-2026/auditoría-señor-😀-顧客.txt"
      );
    });

    it("scan('zip', ...) captura nombres Unicode en las entradas", async () => {
      const root = tempDir();
      await fs.mkdir(path.join(root, "año-2026"), { recursive: true });
      await fs.writeFile(path.join(root, "año-2026", "notas-日本語.txt"), "ok", "utf-8");
      const zipPath = path.join(tempDir(), "unicode.zip");
      await makeSampleZip(zipPath, root);

      const scanner = new ImportScanner();
      const result = await scanner.scan("zip", zipPath);
      expect(result.entries.map((e) => e.relativePath)).toContain("año-2026/notas-日本語.txt");
    });

    it("scanFolder() maneja rutas muy anidadas (ruta larga) sin fallar", async () => {
      const root = tempDir();
      const segments = Array.from({ length: 25 }, (_, i) => `carpeta-anidada-nivel-${i}`);
      const deepDir = path.join(root, ...segments);
      await fs.mkdir(deepDir, { recursive: true });
      const deepFilePath = path.join(deepDir, "fichero-al-final-de-una-ruta-larga.txt");
      await fs.writeFile(deepFilePath, "ok", "utf-8");
      expect(deepFilePath.length).toBeGreaterThan(260);

      const scanner = new ImportScanner();
      const result = await scanner.scanFolder(root);
      const expectedRelative = [...segments, "fichero-al-final-de-una-ruta-larga.txt"].join("/");
      expect(result.entries.map((e) => e.relativePath)).toContain(expectedRelative);
    });
  });

  describe("seguridad: permisos y errores de E/S", () => {
    it("scanFolder() lanza IMPORT_SCAN_FAILED ante un error de lectura (permiso denegado)", async () => {
      const root = tempDir();
      await makeSampleSourceTree(root);

      const readdirSpy = vi
        .spyOn(fs, "readdir")
        .mockRejectedValueOnce(
          Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" })
        );

      try {
        const scanner = new ImportScanner();
        await expect(scanner.scanFolder(root)).rejects.toMatchObject({
          code: ImportErrorCode.IMPORT_SCAN_FAILED,
        });
      } finally {
        readdirSpy.mockRestore();
      }
    });
  });
});
