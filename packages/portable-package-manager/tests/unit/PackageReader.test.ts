import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PackageBuilder } from "../../src/PackageBuilder.js";
import { PackageReader } from "../../src/PackageReader.js";
import { MANIFEST_ENTRY_NAME } from "../../src/PackageManifest.js";
import { PortablePackageErrorCode } from "../../src/errors/PortablePackageErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeSampleSource, makeSelection } from "./support/fixtures.js";

describe("PackageReader", () => {
  let temp: { dir: string; cleanup: () => void };
  afterEach(() => temp?.cleanup());
  const builder = new PackageBuilder();
  const reader = new PackageReader();

  async function makePackage(): Promise<string> {
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "paquete.zip");
    await builder.build("1.0.0", "linux", {
      destinationZipPath: zipPath,
      selection: makeSelection([source]),
    });
    return zipPath;
  }

  it("lista el contenido de un paquete sin extraer nada a disco", async () => {
    temp = makeTempDir();
    const zipPath = await makePackage();
    const before = await fs.readdir(temp.dir);

    const entries = await reader.listEntries(zipPath);
    expect(entries.some((e) => e.relativePath === "workspace/app.json")).toBe(true);
    expect(entries.some((e) => e.relativePath === MANIFEST_ENTRY_NAME)).toBe(true);

    const after = await fs.readdir(temp.dir);
    expect(after).toEqual(before);
  });

  it("lee el manifiesto sin extraer nada", async () => {
    temp = makeTempDir();
    const zipPath = await makePackage();
    const manifest = await reader.readManifest(zipPath);
    expect(manifest.dwmVersion).toBe("1.0.0");
    expect(manifest.entries.length).toBeGreaterThan(0);
  });

  it("readEntryContent devuelve el contenido exacto de una entrada", async () => {
    temp = makeTempDir();
    const zipPath = await makePackage();
    const content = await reader.readEntryContent(zipPath, "workspace/app.json");
    expect(JSON.parse(content!.toString("utf-8"))).toEqual({ ok: true });
  });

  it("readEntryContent devuelve undefined para una entrada que no existe", async () => {
    temp = makeTempDir();
    const zipPath = await makePackage();
    expect(await reader.readEntryContent(zipPath, "no-existe.txt")).toBeUndefined();
  });

  it("lanza PACKAGE_READ_FAILED si el fichero no existe", async () => {
    temp = makeTempDir();
    await expect(reader.listEntries(path.join(temp.dir, "no-existe.zip"))).rejects.toMatchObject({
      code: PortablePackageErrorCode.PACKAGE_READ_FAILED,
    });
  });

  it("lanza PACKAGE_READ_FAILED si el ZIP está corrupto", async () => {
    temp = makeTempDir();
    const badZip = path.join(temp.dir, "corrupto.zip");
    await fs.writeFile(badZip, "esto no es un zip");
    await expect(reader.listEntries(badZip)).rejects.toMatchObject({
      code: PortablePackageErrorCode.PACKAGE_READ_FAILED,
    });
  });

  it("lanza PACKAGE_INVALID_MANIFEST si el paquete no contiene manifiesto", async () => {
    temp = makeTempDir();
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    zip.addFile("solo-un-archivo.txt", Buffer.from("x"));
    const zipPath = path.join(temp.dir, "sin-manifiesto.zip");
    await zip.writeZipPromise(zipPath);

    await expect(reader.readManifest(zipPath)).rejects.toMatchObject({
      code: PortablePackageErrorCode.PACKAGE_INVALID_MANIFEST,
    });
  });

  it("lanza PACKAGE_INVALID_MANIFEST si el manifiesto no es JSON válido", async () => {
    temp = makeTempDir();
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    zip.addFile(MANIFEST_ENTRY_NAME, Buffer.from("{ no es json"));
    const zipPath = path.join(temp.dir, "manifiesto-roto.zip");
    await zip.writeZipPromise(zipPath);

    await expect(reader.readManifest(zipPath)).rejects.toMatchObject({
      code: PortablePackageErrorCode.PACKAGE_INVALID_MANIFEST,
    });
  });

  it("lanza PACKAGE_INVALID_MANIFEST si el manifiesto no tiene la forma correcta", async () => {
    temp = makeTempDir();
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    zip.addFile(MANIFEST_ENTRY_NAME, Buffer.from(JSON.stringify({ formatVersion: "1.0.0" })));
    const zipPath = path.join(temp.dir, "manifiesto-incompleto.zip");
    await zip.writeZipPromise(zipPath);

    await expect(reader.readManifest(zipPath)).rejects.toMatchObject({
      code: PortablePackageErrorCode.PACKAGE_INVALID_MANIFEST,
    });
  });
});
