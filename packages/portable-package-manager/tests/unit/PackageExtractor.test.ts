import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import AdmZip from "adm-zip";
import { PackageBuilder } from "../../src/PackageBuilder.js";
import { PackageExtractor } from "../../src/PackageExtractor.js";
import { MANIFEST_ENTRY_NAME } from "../../src/PackageManifest.js";
import { PortablePackageErrorCode } from "../../src/errors/PortablePackageErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeSampleSource, makeSelection } from "./support/fixtures.js";

describe("PackageExtractor", () => {
  let temp: { dir: string; cleanup: () => void };
  afterEach(() => temp?.cleanup());
  const builder = new PackageBuilder();
  const extractor = new PackageExtractor();

  async function makePackage(): Promise<{ zipPath: string; sourceDir: string }> {
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "paquete.zip");
    await builder.build("1.0.0", "linux", {
      destinationZipPath: zipPath,
      selection: makeSelection([source]),
    });
    return { zipPath, sourceDir: source.absolutePath };
  }

  it("reconstruye el Workspace desde el paquete: mismo contenido, incluidos ocultos y binarios", async () => {
    temp = makeTempDir();
    const { zipPath, sourceDir } = await makePackage();
    const destination = path.join(temp.dir, "destino");

    const result = await extractor.extract({ zipPath, destinationDir: destination });
    expect(result.filesWritten).toBe(4);
    expect(result.filesSkipped).toBe(0);

    const original = await fs.readFile(path.join(sourceDir, "sub", "binario.bin"));
    const extracted = await fs.readFile(path.join(destination, "workspace", "sub", "binario.bin"));
    expect(extracted).toEqual(original);

    const hidden = await fs.readFile(path.join(destination, "workspace", ".oculto"), "utf-8");
    expect(hidden).toBe("oculto");

    const emptyStat = await fs.stat(path.join(destination, "workspace", "sub", "vacio.txt"));
    expect(emptyStat.size).toBe(0);
  });

  it("política 'fail' (por defecto): lanza PACKAGE_CONFLICT si el destino ya tiene ficheros", async () => {
    temp = makeTempDir();
    const { zipPath } = await makePackage();
    const destination = path.join(temp.dir, "destino");
    await fs.mkdir(path.join(destination, "workspace"), { recursive: true });
    await fs.writeFile(path.join(destination, "workspace", "app.json"), "ya existe");

    await expect(extractor.extract({ zipPath, destinationDir: destination })).rejects.toMatchObject(
      {
        code: PortablePackageErrorCode.PACKAGE_CONFLICT,
      }
    );
    expect(await fs.readFile(path.join(destination, "workspace", "app.json"), "utf-8")).toBe(
      "ya existe"
    );
  });

  it("política 'skip': conserva el fichero existente y extrae el resto", async () => {
    temp = makeTempDir();
    const { zipPath } = await makePackage();
    const destination = path.join(temp.dir, "destino");
    await fs.mkdir(path.join(destination, "workspace"), { recursive: true });
    await fs.writeFile(path.join(destination, "workspace", "app.json"), "conservar");

    const result = await extractor.extract({
      zipPath,
      destinationDir: destination,
      conflictPolicy: "skip",
    });
    expect(result.filesSkipped).toBe(1);
    expect(await fs.readFile(path.join(destination, "workspace", "app.json"), "utf-8")).toBe(
      "conservar"
    );
    expect(
      await fs
        .stat(path.join(destination, "workspace", "sub", "binario.bin"))
        .then((s) => s.isFile())
    ).toBe(true);
  });

  it("política 'overwrite': sustituye el fichero existente", async () => {
    temp = makeTempDir();
    const { zipPath } = await makePackage();
    const destination = path.join(temp.dir, "destino");
    await fs.mkdir(path.join(destination, "workspace"), { recursive: true });
    await fs.writeFile(path.join(destination, "workspace", "app.json"), "sobrescribir-esto");

    const result = await extractor.extract({
      zipPath,
      destinationDir: destination,
      conflictPolicy: "overwrite",
    });
    expect(result.filesWritten).toBe(4);
    expect(await fs.readFile(path.join(destination, "workspace", "app.json"), "utf-8")).toContain(
      "ok"
    );
  });

  it("dry-run de extracción no escribe nada y reporta conflictos", async () => {
    temp = makeTempDir();
    const { zipPath } = await makePackage();
    const destination = path.join(temp.dir, "destino");
    await fs.mkdir(path.join(destination, "workspace"), { recursive: true });
    await fs.writeFile(path.join(destination, "workspace", "app.json"), "existente");

    const report = await extractor.planDryRun({
      zipPath,
      destinationDir: destination,
      conflictPolicy: "skip",
    });
    expect(report.conflicts.some((c) => c.relativePath === "workspace/app.json")).toBe(true);
    expect(await fs.readFile(path.join(destination, "workspace", "app.json"), "utf-8")).toBe(
      "existente"
    );
    expect(
      await fs.stat(path.join(destination, "workspace", "sub")).catch(() => undefined)
    ).toBeUndefined();
  });

  it("protege contra Zip Slip: un manifiesto manipulado con '..' se rechaza antes de escribir nada", async () => {
    temp = makeTempDir();
    const { zipPath } = await makePackage();
    const destination = path.join(temp.dir, "destino");

    const zip = new AdmZip(zipPath);
    const manifest = JSON.parse(zip.getEntry(MANIFEST_ENTRY_NAME)!.getData().toString("utf-8"));
    manifest.entries.push({ relativePath: "../fuera-del-destino.txt", type: "file", size: 1 });
    manifest.totalFiles += 1;
    zip.updateFile(MANIFEST_ENTRY_NAME, Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.addFile("../fuera-del-destino.txt", Buffer.from("x"));
    zip.writeZip(zipPath);

    await expect(extractor.extract({ zipPath, destinationDir: destination })).rejects.toMatchObject(
      {
        code: PortablePackageErrorCode.PACKAGE_UNSAFE_PATH,
      }
    );
    expect(
      await fs.stat(path.join(temp.dir, "fuera-del-destino.txt")).catch(() => undefined)
    ).toBeUndefined();
  });

  it("protege contra rutas absolutas en el manifiesto", async () => {
    temp = makeTempDir();
    const { zipPath } = await makePackage();
    const destination = path.join(temp.dir, "destino");

    const zip = new AdmZip(zipPath);
    const manifest = JSON.parse(zip.getEntry(MANIFEST_ENTRY_NAME)!.getData().toString("utf-8"));
    manifest.entries.push({ relativePath: "/etc/passwd", type: "file", size: 1 });
    zip.updateFile(MANIFEST_ENTRY_NAME, Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.writeZip(zipPath);

    await expect(extractor.extract({ zipPath, destinationDir: destination })).rejects.toMatchObject(
      {
        code: PortablePackageErrorCode.PACKAGE_UNSAFE_PATH,
      }
    );
  });

  it("no deja carpetas de preparación (staging) tras un error", async () => {
    temp = makeTempDir();
    const { zipPath } = await makePackage();
    const destination = path.join(temp.dir, "destino");

    const zip = new AdmZip(zipPath);
    const manifest = JSON.parse(zip.getEntry(MANIFEST_ENTRY_NAME)!.getData().toString("utf-8"));
    manifest.entries.push({ relativePath: "../evil.txt", type: "file", size: 1 });
    zip.updateFile(MANIFEST_ENTRY_NAME, Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.writeZip(zipPath);

    await expect(extractor.extract({ zipPath, destinationDir: destination })).rejects.toThrow();

    const siblings = await fs.readdir(temp.dir);
    expect(siblings.some((name) => name.startsWith(".dwm-ppm-staging-"))).toBe(false);
  });

  it("lanza PACKAGE_INCOMPATIBLE_VERSION si formatVersion no coincide", async () => {
    temp = makeTempDir();
    const { zipPath } = await makePackage();
    const destination = path.join(temp.dir, "destino");

    const zip = new AdmZip(zipPath);
    const manifest = JSON.parse(zip.getEntry(MANIFEST_ENTRY_NAME)!.getData().toString("utf-8"));
    manifest.formatVersion = "0.0.1";
    zip.updateFile(MANIFEST_ENTRY_NAME, Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.writeZip(zipPath);

    await expect(extractor.extract({ zipPath, destinationDir: destination })).rejects.toMatchObject(
      {
        code: PortablePackageErrorCode.PACKAGE_INCOMPATIBLE_VERSION,
      }
    );
  });

  it("lanza PACKAGE_LIMIT_EXCEEDED si el manifiesto declara más entradas que el límite", async () => {
    temp = makeTempDir();
    const { zipPath } = await makePackage();
    const destination = path.join(temp.dir, "destino");

    await expect(
      extractor.extract({ zipPath, destinationDir: destination, securityLimits: { maxEntries: 1 } })
    ).rejects.toMatchObject({ code: PortablePackageErrorCode.PACKAGE_LIMIT_EXCEEDED });
  });

  it("detecta una relación de compresión sospechosa (posible bomba ZIP)", async () => {
    temp = makeTempDir();
    const rootDir = path.join(temp.dir, "origen-grande");
    await fs.mkdir(rootDir, { recursive: true });
    await fs.writeFile(path.join(rootDir, "ceros.bin"), Buffer.alloc(1_200_000, 0));
    const zipPath = path.join(temp.dir, "paquete-grande.zip");
    await builder.build("1.0.0", "linux", {
      destinationZipPath: zipPath,
      selection: makeSelection([{ id: "workspace", absolutePath: rootDir, optional: false }]),
    });

    const destination = path.join(temp.dir, "destino");
    await expect(
      extractor.extract({
        zipPath,
        destinationDir: destination,
        securityLimits: { maxCompressionRatio: 2 },
      })
    ).rejects.toMatchObject({ code: PortablePackageErrorCode.PACKAGE_LIMIT_EXCEEDED });
  });

  it("respeta la cancelación mediante AbortSignal", async () => {
    temp = makeTempDir();
    const { zipPath } = await makePackage();
    const destination = path.join(temp.dir, "destino");
    const controller = new AbortController();
    controller.abort();

    await expect(
      extractor.extract({ zipPath, destinationDir: destination, signal: controller.signal })
    ).rejects.toMatchObject({ code: PortablePackageErrorCode.PACKAGE_CANCELLED });
  });

  it("informa progreso a través de onProgress", async () => {
    temp = makeTempDir();
    const { zipPath } = await makePackage();
    const destination = path.join(temp.dir, "destino");
    const updates: number[] = [];

    await extractor.extract({
      zipPath,
      destinationDir: destination,
      onProgress: (update) => {
        updates.push(update.entriesProcessed);
      },
    });
    expect(updates.length).toBeGreaterThan(0);
  });
});
