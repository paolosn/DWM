import { describe, it, expect } from "vitest";
import {
  buildManifest,
  checkManifestShape,
  serializeManifest,
  sortEntriesDeterministically,
} from "../../src/PackageManifest.js";
import { PACKAGE_FORMAT_VERSION } from "../../src/PortablePackageTypes.js";
import type { PackageManifestEntry } from "../../src/PortablePackageTypes.js";

function entry(overrides: Partial<PackageManifestEntry> = {}): PackageManifestEntry {
  return { relativePath: "a", type: "file", size: 1, ...overrides };
}

describe("sortEntriesDeterministically", () => {
  it("ordena por relativePath sin mutar el array original", () => {
    const original = [entry({ relativePath: "z" }), entry({ relativePath: "a" })];
    const sorted = sortEntriesDeterministically(original);
    expect(sorted.map((e) => e.relativePath)).toEqual(["a", "z"]);
    expect(original.map((e) => e.relativePath)).toEqual(["z", "a"]);
  });
});

describe("buildManifest", () => {
  it("construye un manifiesto completo con contadores correctos", () => {
    const manifest = buildManifest({
      entries: [
        entry({ relativePath: "config/app.json", size: 10 }),
        entry({ relativePath: "config", type: "directory", size: 0 }),
      ],
      excludedPatterns: ["*.tmp"],
      includedOptionalResources: ["logs"],
      dwmVersion: "1.2.3",
      sourcePlatform: "linux",
    });

    expect(manifest.formatVersion).toBe(PACKAGE_FORMAT_VERSION);
    expect(manifest.totalFiles).toBe(1);
    expect(manifest.totalDirectories).toBe(1);
    expect(manifest.totalBytes).toBe(10);
    expect(manifest.excludedPatterns).toEqual(["*.tmp"]);
    expect(manifest.includedOptionalResources).toEqual(["logs"]);
    expect(typeof manifest.packageId).toBe("string");
    expect(typeof manifest.contentHash).toBe("string");
    expect(typeof manifest.createdAt).toBe("string");
  });

  it("ordena las entradas de forma determinista independientemente del orden de entrada", () => {
    const a = buildManifest({
      entries: [entry({ relativePath: "z.txt" }), entry({ relativePath: "a.txt" })],
      excludedPatterns: [],
      includedOptionalResources: [],
      dwmVersion: "1.0.0",
      sourcePlatform: "linux",
    });
    expect(a.entries.map((e) => e.relativePath)).toEqual(["a.txt", "z.txt"]);
  });

  it("usa el packageId y workspaceId indicados si se proporcionan", () => {
    const manifest = buildManifest({
      entries: [],
      excludedPatterns: [],
      includedOptionalResources: [],
      dwmVersion: "1.0.0",
      sourcePlatform: "linux",
      packageId: "id-fijo",
      workspaceId: "workspace-1",
    });
    expect(manifest.packageId).toBe("id-fijo");
    expect(manifest.workspaceId).toBe("workspace-1");
  });

  it("omite workspaceId y packageMetadata si no se indican", () => {
    const manifest = buildManifest({
      entries: [],
      excludedPatterns: [],
      includedOptionalResources: [],
      dwmVersion: "1.0.0",
      sourcePlatform: "linux",
    });
    expect(manifest.workspaceId).toBeUndefined();
    expect(manifest.packageMetadata).toBeUndefined();
  });

  it("el contentHash es estable independientemente de cuándo se genere createdAt", async () => {
    const input = {
      entries: [entry({ relativePath: "a.txt", integrity: "sha256:aaa" })],
      excludedPatterns: [],
      includedOptionalResources: [],
      dwmVersion: "1.0.0",
      sourcePlatform: "linux",
      packageId: "mismo-id",
    };
    const first = buildManifest(input);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = buildManifest(input);
    expect(first.createdAt).not.toBe(second.createdAt);
    expect(first.contentHash).toBe(second.contentHash);
  });
});

describe("serializeManifest", () => {
  it("produce JSON válido que termina en salto de línea", () => {
    const manifest = buildManifest({
      entries: [],
      excludedPatterns: [],
      includedOptionalResources: [],
      dwmVersion: "1.0.0",
      sourcePlatform: "linux",
    });
    const serialized = serializeManifest(manifest);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toMatchObject({ formatVersion: PACKAGE_FORMAT_VERSION });
  });
});

describe("checkManifestShape", () => {
  it("acepta un manifiesto bien formado", () => {
    const manifest = buildManifest({
      entries: [entry({ relativePath: "a.txt" })],
      excludedPatterns: [],
      includedOptionalResources: [],
      dwmVersion: "1.0.0",
      sourcePlatform: "linux",
    });
    expect(checkManifestShape(manifest).valid).toBe(true);
  });

  it("rechaza valores que no son objetos", () => {
    expect(checkManifestShape(null).valid).toBe(false);
    expect(checkManifestShape("texto").valid).toBe(false);
    expect(checkManifestShape(42).valid).toBe(false);
  });

  it("acumula issues por cada campo obligatorio ausente o de tipo incorrecto", () => {
    const result = checkManifestShape({ entries: "no-es-array" });
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(3);
  });

  it("rechaza entradas individuales inválidas dentro de entries", () => {
    const result = checkManifestShape({
      formatVersion: "1.0.0",
      packageId: "x",
      createdAt: new Date().toISOString(),
      dwmVersion: "1.0.0",
      sourcePlatform: "linux",
      entries: [{ relativePath: "", type: "carpeta", size: -1 }],
      totalFiles: 0,
      totalDirectories: 0,
      totalBytes: 0,
      excludedPatterns: [],
      includedOptionalResources: [],
      integrityAlgorithm: "sha256",
      contentHash: "sha256:x",
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("relativePath"))).toBe(true);
    expect(result.issues.some((i) => i.includes("type"))).toBe(true);
    expect(result.issues.some((i) => i.includes("size"))).toBe(true);
  });

  it("rechaza createdAt con formato de fecha inválido", () => {
    const manifest = buildManifest({
      entries: [],
      excludedPatterns: [],
      includedOptionalResources: [],
      dwmVersion: "1.0.0",
      sourcePlatform: "linux",
    });
    const result = checkManifestShape({ ...manifest, createdAt: "no-es-fecha" });
    expect(result.valid).toBe(false);
  });
});
