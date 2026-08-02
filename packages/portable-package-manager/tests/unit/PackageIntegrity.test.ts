import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { hashBuffer, hashFile, computeContentHash } from "../../src/PackageIntegrity.js";
import type { PackageManifestEntry } from "../../src/PortablePackageTypes.js";
import { makeTempDir } from "./support/tempDir.js";

describe("hashBuffer", () => {
  it("produce un hash estable con el prefijo del algoritmo", () => {
    const hash = hashBuffer(Buffer.from("hola mundo"));
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashBuffer(Buffer.from("hola mundo"))).toBe(hash);
  });

  it("produce hashes distintos para contenidos distintos", () => {
    expect(hashBuffer(Buffer.from("a"))).not.toBe(hashBuffer(Buffer.from("b")));
  });

  it("hashea correctamente un buffer vacío", () => {
    expect(hashBuffer(Buffer.alloc(0))).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe("hashFile", () => {
  let temp: { dir: string; cleanup: () => void };
  afterEach(() => temp?.cleanup());

  it("coincide con hashBuffer del mismo contenido", async () => {
    temp = makeTempDir();
    const filePath = path.join(temp.dir, "archivo.bin");
    const content = Buffer.from("contenido binario de prueba \x00\x01\x02");
    await fs.writeFile(filePath, content);
    expect(await hashFile(filePath)).toBe(hashBuffer(content));
  });

  it("hashea correctamente un fichero vacío", async () => {
    temp = makeTempDir();
    const filePath = path.join(temp.dir, "vacio.txt");
    await fs.writeFile(filePath, "");
    expect(await hashFile(filePath)).toBe(hashBuffer(Buffer.alloc(0)));
  });

  it("hashea correctamente un fichero más grande que el buffer interno de lectura", async () => {
    temp = makeTempDir();
    const filePath = path.join(temp.dir, "grande.bin");
    const content = Buffer.alloc(200 * 1024, 7);
    await fs.writeFile(filePath, content);
    expect(await hashFile(filePath)).toBe(hashBuffer(content));
  });
});

describe("computeContentHash", () => {
  function entry(overrides: Partial<PackageManifestEntry>): PackageManifestEntry {
    return { relativePath: "a", type: "file", size: 1, ...overrides };
  }

  it("es determinista para las mismas entradas", () => {
    const entries = [entry({ relativePath: "a.txt", integrity: "sha256:aaa" })];
    expect(computeContentHash(entries)).toBe(computeContentHash(entries));
  });

  it("no depende del orden en que se le pasen las entradas si ya vienen ordenadas igual", () => {
    const a = [entry({ relativePath: "a.txt" }), entry({ relativePath: "b.txt" })];
    const b = [entry({ relativePath: "a.txt" }), entry({ relativePath: "b.txt" })];
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it("cambia si cambia el contenido de una entrada", () => {
    const a = [entry({ relativePath: "a.txt", integrity: "sha256:aaa" })];
    const b = [entry({ relativePath: "a.txt", integrity: "sha256:bbb" })];
    expect(computeContentHash(a)).not.toBe(computeContentHash(b));
  });

  it("cambia si el orden de las entradas es distinto (no reordena internamente)", () => {
    const a = [entry({ relativePath: "a.txt" }), entry({ relativePath: "b.txt" })];
    const b = [entry({ relativePath: "b.txt" }), entry({ relativePath: "a.txt" })];
    expect(computeContentHash(a)).not.toBe(computeContentHash(b));
  });

  it("con lista vacía devuelve un hash estable", () => {
    expect(computeContentHash([])).toBe(computeContentHash([]));
  });
});
