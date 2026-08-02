import { describe, it, expect, afterEach } from "vitest";
import * as path from "node:path";
import AdmZip from "adm-zip";
import { PackageBuilder } from "../../src/PackageBuilder.js";
import { PackageValidator } from "../../src/PackageValidator.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeSampleSource, makeSelection } from "./support/fixtures.js";

describe("PackageValidator", () => {
  let temp: { dir: string; cleanup: () => void };
  afterEach(() => temp?.cleanup());
  const builder = new PackageBuilder();
  const validator = new PackageValidator();

  async function makePackage(): Promise<string> {
    const source = await makeSampleSource(temp.dir, "workspace");
    const zipPath = path.join(temp.dir, "paquete.zip");
    await builder.build("1.0.0", "linux", {
      destinationZipPath: zipPath,
      selection: makeSelection([source]),
    });
    return zipPath;
  }

  it("valida correctamente un paquete recién construido", async () => {
    temp = makeTempDir();
    const zipPath = await makePackage();
    const result = await validator.validate(zipPath);
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("detecta un fichero modificado (hash distinto al declarado)", async () => {
    temp = makeTempDir();
    const zipPath = await makePackage();

    const zip = new AdmZip(zipPath);
    zip.updateFile("workspace/app.json", Buffer.from('{"manipulado": true}'));
    zip.writeZip(zipPath);

    const result = await validator.validate(zipPath);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (i) => i.kind === "modified-file" && i.relativePath === "workspace/app.json"
      )
    ).toBe(true);
  });

  it("detecta un fichero ausente (declarado en el manifiesto pero no presente en el ZIP)", async () => {
    temp = makeTempDir();
    const zipPath = await makePackage();

    const zip = new AdmZip(zipPath);
    zip.deleteFile("workspace/app.json");
    zip.writeZip(zipPath);

    const result = await validator.validate(zipPath);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (i) => i.kind === "missing-file" && i.relativePath === "workspace/app.json"
      )
    ).toBe(true);
  });

  it("detecta un fichero añadido sin declarar en el manifiesto", async () => {
    temp = makeTempDir();
    const zipPath = await makePackage();

    const zip = new AdmZip(zipPath);
    zip.addFile("workspace/intruso.txt", Buffer.from("no declarado"));
    zip.writeZip(zipPath);

    const result = await validator.validate(zipPath);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (i) => i.kind === "extra-file" && i.relativePath === "workspace/intruso.txt"
      )
    ).toBe(true);
  });

  it("detecta manifiesto inválido si el paquete no contiene ninguno", async () => {
    temp = makeTempDir();
    const zip = new AdmZip();
    zip.addFile("cualquier-cosa.txt", Buffer.from("x"));
    const zipPath = path.join(temp.dir, "sin-manifiesto.zip");
    await zip.writeZipPromise(zipPath);

    const result = await validator.validate(zipPath);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.kind).toBe("invalid-manifest");
  });

  it("detecta una versión de formato incompatible", async () => {
    temp = makeTempDir();
    const zipPath = await makePackage();

    const zip = new AdmZip(zipPath);
    const manifestEntry = zip.getEntry("dwm-package-manifest.json")!;
    const manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
    manifest.formatVersion = "99.0.0";
    zip.updateFile("dwm-package-manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.writeZip(zipPath);

    const result = await validator.validate(zipPath);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.kind === "incompatible-version")).toBe(true);
  });

  it("propaga un fallo de lectura como resultado inválido en vez de lanzar", async () => {
    temp = makeTempDir();
    await expect(validator.validate(path.join(temp.dir, "no-existe.zip"))).resolves.toMatchObject({
      valid: false,
    });
  });
});
