import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import AdmZip from "adm-zip";
import { PackageBuilder } from "../../src/PackageBuilder.js";
import { MANIFEST_ENTRY_NAME } from "../../src/PackageManifest.js";
import { PortablePackageErrorCode } from "../../src/errors/PortablePackageErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeSampleSource, makeSelection } from "./support/fixtures.js";

describe("PackageBuilder", () => {
  let temp: { dir: string; cleanup: () => void };
  afterEach(() => temp?.cleanup());
  const builder = new PackageBuilder();

  it("crea un paquete ZIP real con manifiesto y contenido preservado", async () => {
    temp = makeTempDir();
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "salida.zip");

    const result = await builder.build("1.0.0", "linux", {
      destinationZipPath: zipPath,
      selection: makeSelection([source]),
    });

    expect(await fs.stat(zipPath).then((s) => s.isFile())).toBe(true);
    expect(result.manifest.totalFiles).toBe(4); // app.json, binario.bin, vacio.txt, .oculto
    expect(result.manifest.dwmVersion).toBe("1.0.0");
    expect(result.manifest.sourcePlatform).toBe("linux");

    const zip = new AdmZip(zipPath);
    expect(zip.getEntry(MANIFEST_ENTRY_NAME)).toBeTruthy();
    expect(zip.getEntry("workspace/app.json")).toBeTruthy();
    expect(zip.getEntry("workspace/.oculto")).toBeTruthy();

    const binary = zip.getEntry("workspace/sub/binario.bin")?.getData();
    expect(binary).toEqual(Buffer.from([0, 1, 2, 255, 254]));

    const empty = zip.getEntry("workspace/sub/vacio.txt")?.getData();
    expect(empty?.length).toBe(0);
  });

  it("las entradas del manifiesto quedan en orden determinista por ruta", async () => {
    temp = makeTempDir();
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "salida.zip");
    const result = await builder.build("1.0.0", "linux", {
      destinationZipPath: zipPath,
      selection: makeSelection([source]),
    });

    const paths = result.manifest.entries.map((e) => e.relativePath);
    const sorted = [...paths].sort((a, b) => a.localeCompare(b));
    expect(paths).toEqual(sorted);
  });

  it("calcula un hash por fichero y un contentHash estable entre dos builds idénticos", async () => {
    temp = makeTempDir();
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipA = path.join(temp.dir, "a.zip");
    const zipB = path.join(temp.dir, "b.zip");

    const resultA = await builder.build("1.0.0", "linux", {
      destinationZipPath: zipA,
      selection: makeSelection([source]),
      packageId: "id-fijo",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const resultB = await builder.build("1.0.0", "linux", {
      destinationZipPath: zipB,
      selection: makeSelection([source]),
      packageId: "id-fijo",
    });

    for (const entry of resultA.manifest.entries) {
      if (entry.type === "file") expect(typeof entry.integrity).toBe("string");
    }
    expect(resultA.manifest.createdAt).not.toBe(resultB.manifest.createdAt);
    expect(resultA.manifest.contentHash).toBe(resultB.manifest.contentHash);
  });

  it("aplica patrones de exclusión", async () => {
    temp = makeTempDir();
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "salida.zip");

    const result = await builder.build("1.0.0", "linux", {
      destinationZipPath: zipPath,
      selection: makeSelection([source], { excludePatterns: ["workspace/sub/**"] }),
    });

    const paths = result.manifest.entries.map((e) => e.relativePath);
    expect(paths).not.toContain("workspace/sub/binario.bin");
    expect(paths).toContain("workspace/app.json");
  });

  it("incluye recursos opcionales solo cuando se piden", async () => {
    temp = makeTempDir();
    const workspace = await makeSampleSource(temp.dir, "workspace");
    const logs = await makeSampleSource(temp.dir, "logs");
    const zipPath = path.join(temp.dir, "salida.zip");

    const withoutLogs = await builder.build("1.0.0", "linux", {
      destinationZipPath: zipPath,
      selection: makeSelection([workspace, { ...logs, optional: true }]),
    });
    expect(withoutLogs.manifest.entries.some((e) => e.relativePath.startsWith("logs/"))).toBe(
      false
    );
  });

  it("omite en silencio una fuente opcional que no existe, y advierte de una obligatoria ausente", async () => {
    temp = makeTempDir();
    const workspace = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "salida.zip");

    const result = await builder.build("1.0.0", "linux", {
      destinationZipPath: zipPath,
      selection: makeSelection([
        workspace,
        {
          id: "no-existe-opcional",
          absolutePath: path.join(temp.dir, "no-existe"),
          optional: true,
        },
        {
          id: "no-existe-obligatoria",
          absolutePath: path.join(temp.dir, "tampoco"),
          optional: false,
        },
      ]),
    });

    expect(result.warnings.some((w) => w.includes("no-existe-obligatoria"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("no-existe-opcional"))).toBe(false);
  });

  it("modo dry-run no escribe ningún ZIP", async () => {
    temp = makeTempDir();
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "no-deberia-existir.zip");

    const report = await builder.planDryRun("1.0.0", "linux", {
      destinationZipPath: zipPath,
      selection: makeSelection([source]),
    });

    expect(report.included.length).toBeGreaterThan(0);
    expect(report.destination).toBe(zipPath);
    expect(await fs.stat(zipPath).catch(() => undefined)).toBeUndefined();
  });

  it("lanza PACKAGE_LIMIT_EXCEEDED si un fichero supera el límite por entrada", async () => {
    temp = makeTempDir();
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "salida.zip");

    await expect(
      builder.build("1.0.0", "linux", {
        destinationZipPath: zipPath,
        selection: makeSelection([source]),
        securityLimits: { maxEntryBytes: 2 },
      })
    ).rejects.toMatchObject({ code: PortablePackageErrorCode.PACKAGE_LIMIT_EXCEEDED });
  });

  it("lanza PACKAGE_LIMIT_EXCEEDED si se supera el número máximo de entradas", async () => {
    temp = makeTempDir();
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "salida.zip");

    await expect(
      builder.build("1.0.0", "linux", {
        destinationZipPath: zipPath,
        selection: makeSelection([source]),
        securityLimits: { maxEntries: 1 },
      })
    ).rejects.toMatchObject({ code: PortablePackageErrorCode.PACKAGE_LIMIT_EXCEEDED });
  });

  it("respeta la cancelación mediante AbortSignal y no deja temporales", async () => {
    temp = makeTempDir();
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "salida.zip");
    const controller = new AbortController();
    controller.abort();

    await expect(
      builder.build("1.0.0", "linux", {
        destinationZipPath: zipPath,
        selection: makeSelection([source]),
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: PortablePackageErrorCode.PACKAGE_CANCELLED });

    const leftovers = (await fs.readdir(temp.dir)).filter((name) => name.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("informa progreso a través de onProgress", async () => {
    temp = makeTempDir();
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "salida.zip");
    const updates: number[] = [];

    await builder.build("1.0.0", "linux", {
      destinationZipPath: zipPath,
      selection: makeSelection([source]),
      onProgress: (update) => {
        updates.push(update.entriesProcessed);
      },
    });
    expect(updates.length).toBeGreaterThan(0);
  });
});
