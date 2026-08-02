import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PackageConflictResolver } from "../../src/PackageConflictResolver.js";
import type { PackageManifestEntry } from "../../src/PortablePackageTypes.js";
import { makeTempDir } from "./support/tempDir.js";

function entry(overrides: Partial<PackageManifestEntry>): PackageManifestEntry {
  return { relativePath: "a.txt", type: "file", size: 1, ...overrides };
}

describe("PackageConflictResolver", () => {
  let temp: { dir: string; cleanup: () => void };
  afterEach(() => temp?.cleanup());
  const resolver = new PackageConflictResolver();

  it("marca 'write' para ficheros que no existen todavía, con cualquier política", async () => {
    temp = makeTempDir();
    const decisions = await resolver.resolve(
      temp.dir,
      [entry({ relativePath: "nuevo.txt" })],
      "fail"
    );
    expect(decisions).toEqual([{ relativePath: "nuevo.txt", exists: false, action: "write" }]);
  });

  it("las carpetas nunca generan conflicto", async () => {
    temp = makeTempDir();
    await fs.mkdir(path.join(temp.dir, "carpeta"), { recursive: true });
    const decisions = await resolver.resolve(
      temp.dir,
      [entry({ relativePath: "carpeta", type: "directory", size: 0 })],
      "fail"
    );
    expect(decisions).toEqual([]);
  });

  it("política 'fail': marca 'fail' para ficheros existentes", async () => {
    temp = makeTempDir();
    await fs.writeFile(path.join(temp.dir, "existe.txt"), "x");
    const decisions = await resolver.resolve(
      temp.dir,
      [entry({ relativePath: "existe.txt" })],
      "fail"
    );
    expect(decisions).toEqual([{ relativePath: "existe.txt", exists: true, action: "fail" }]);
  });

  it("política 'skip': marca 'skip' para ficheros existentes", async () => {
    temp = makeTempDir();
    await fs.writeFile(path.join(temp.dir, "existe.txt"), "x");
    const decisions = await resolver.resolve(
      temp.dir,
      [entry({ relativePath: "existe.txt" })],
      "skip"
    );
    expect(decisions).toEqual([{ relativePath: "existe.txt", exists: true, action: "skip" }]);
  });

  it("política 'overwrite': marca 'write' para ficheros existentes", async () => {
    temp = makeTempDir();
    await fs.writeFile(path.join(temp.dir, "existe.txt"), "x");
    const decisions = await resolver.resolve(
      temp.dir,
      [entry({ relativePath: "existe.txt" })],
      "overwrite"
    );
    expect(decisions).toEqual([{ relativePath: "existe.txt", exists: true, action: "write" }]);
  });

  it("evalúa cada entrada de forma independiente", async () => {
    temp = makeTempDir();
    await fs.writeFile(path.join(temp.dir, "existe.txt"), "x");
    const decisions = await resolver.resolve(
      temp.dir,
      [entry({ relativePath: "existe.txt" }), entry({ relativePath: "nuevo.txt" })],
      "skip"
    );
    expect(decisions).toEqual([
      { relativePath: "existe.txt", exists: true, action: "skip" },
      { relativePath: "nuevo.txt", exists: false, action: "write" },
    ]);
  });
});
