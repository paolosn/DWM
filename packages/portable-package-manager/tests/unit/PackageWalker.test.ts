import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PackageWalker } from "../../src/PackageWalker.js";
import { makeTempDir } from "./support/tempDir.js";

describe("PackageWalker", () => {
  let temp: { dir: string; cleanup: () => void };
  afterEach(() => temp?.cleanup());
  const walker = new PackageWalker();

  it("recorre ficheros y carpetas anidadas, incluidos vacíos y con nombres Unicode", async () => {
    temp = makeTempDir();
    await fs.mkdir(path.join(temp.dir, "sub"), { recursive: true });
    await fs.writeFile(path.join(temp.dir, "a.txt"), "contenido");
    await fs.writeFile(path.join(temp.dir, "sub", "vacío.txt"), "");
    await fs.writeFile(path.join(temp.dir, "sub", "archivo-日本語.txt"), "x");

    const result = await walker.walk(temp.dir, { includeHidden: true });
    const paths = result.entries.map((e) => e.relativePath).sort();
    expect(paths).toEqual(["a.txt", "sub", "sub/archivo-日本語.txt", "sub/vacío.txt"]);

    const emptyFile = result.entries.find((e) => e.relativePath === "sub/vacío.txt");
    expect(emptyFile?.size).toBe(0);
    expect(emptyFile?.type).toBe("file");

    const dirEntry = result.entries.find((e) => e.relativePath === "sub");
    expect(dirEntry?.type).toBe("directory");
  });

  it("incluye ficheros y carpetas ocultos cuando includeHidden es true", async () => {
    temp = makeTempDir();
    await fs.writeFile(path.join(temp.dir, ".oculto"), "x");
    await fs.mkdir(path.join(temp.dir, ".carpeta-oculta"), { recursive: true });
    await fs.writeFile(path.join(temp.dir, ".carpeta-oculta", "dentro.txt"), "y");

    const result = await walker.walk(temp.dir, { includeHidden: true });
    const paths = result.entries.map((e) => e.relativePath).sort();
    expect(paths).toContain(".oculto");
    expect(paths).toContain(".carpeta-oculta");
    expect(paths).toContain(".carpeta-oculta/dentro.txt");
  });

  it("omite ficheros y carpetas ocultos cuando includeHidden es false", async () => {
    temp = makeTempDir();
    await fs.writeFile(path.join(temp.dir, ".oculto"), "x");
    await fs.writeFile(path.join(temp.dir, "visible.txt"), "y");

    const result = await walker.walk(temp.dir, { includeHidden: false });
    expect(result.entries.map((e) => e.relativePath)).toEqual(["visible.txt"]);
  });

  it("detecta el bit ejecutable de un fichero", async () => {
    temp = makeTempDir();
    const scriptPath = path.join(temp.dir, "script.sh");
    await fs.writeFile(scriptPath, "#!/bin/sh\necho hola\n");
    await fs.chmod(scriptPath, 0o755);
    await fs.writeFile(path.join(temp.dir, "normal.txt"), "x");

    const result = await walker.walk(temp.dir, { includeHidden: true });
    expect(result.entries.find((e) => e.relativePath === "script.sh")?.executable).toBe(true);
    expect(result.entries.find((e) => e.relativePath === "normal.txt")?.executable).toBe(false);
  });

  it("recorre por contenido un symlink que apunta dentro del origen permitido", async () => {
    temp = makeTempDir();
    await fs.mkdir(path.join(temp.dir, "real"), { recursive: true });
    await fs.writeFile(path.join(temp.dir, "real", "dentro.txt"), "contenido real");
    await fs.symlink(path.join(temp.dir, "real"), path.join(temp.dir, "enlace"), "dir");

    const result = await walker.walk(temp.dir, { includeHidden: true });
    const paths = result.entries.map((e) => e.relativePath).sort();
    expect(paths).toContain("enlace/dentro.txt");
    expect(result.warnings).toEqual([]);
  });

  it("omite y advierte de un symlink que apunta fuera del origen permitido", async () => {
    temp = makeTempDir();
    const outside = makeTempDir();
    await fs.writeFile(path.join(outside.dir, "secreto.txt"), "fuera");
    await fs.symlink(outside.dir, path.join(temp.dir, "enlace-peligroso"), "dir");

    const result = await walker.walk(temp.dir, { includeHidden: true });
    expect(result.entries.map((e) => e.relativePath)).not.toContain("enlace-peligroso");
    expect(result.warnings.some((w) => w.includes("enlace-peligroso"))).toBe(true);
    outside.cleanup();
  });

  it("omite y advierte de un symlink roto", async () => {
    temp = makeTempDir();
    await fs.symlink(path.join(temp.dir, "no-existe"), path.join(temp.dir, "roto"));

    const result = await walker.walk(temp.dir, { includeHidden: true });
    expect(result.entries).toEqual([]);
    expect(result.warnings.some((w) => w.includes("roto"))).toBe(true);
  });

  it("respeta un AbortSignal ya activado, devolviendo lo recorrido hasta ese punto", async () => {
    temp = makeTempDir();
    await fs.writeFile(path.join(temp.dir, "a.txt"), "x");
    const controller = new AbortController();
    controller.abort();

    const result = await walker.walk(temp.dir, { includeHidden: true, signal: controller.signal });
    expect(result.entries).toEqual([]);
  });

  it("invoca onEntry por cada entrada encontrada", async () => {
    temp = makeTempDir();
    await fs.writeFile(path.join(temp.dir, "a.txt"), "x");
    const seen: string[] = [];

    await walker.walk(temp.dir, {
      includeHidden: true,
      onEntry: (entry) => seen.push(entry.relativePath),
    });
    expect(seen).toEqual(["a.txt"]);
  });
});
