import { describe, it, expect, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ImportScanner } from "../../src/ImportScanner.js";
import { ImportService } from "../../src/ImportService.js";
import { ImportErrorCode } from "../../src/errors/ImportErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeSampleSourceTree, makeSampleZip } from "./support/fixtures.js";

describe("ImportService", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("copyToStaging() desde una carpeta copia ficheros, ocultos y symlinks preservando el modo", async () => {
    const root = tempDir();
    await makeSampleSourceTree(root);
    await fs.symlink(path.join(root, "readme.md"), path.join(root, "enlace.md"));
    await fs.chmod(path.join(root, "readme.md"), 0o640);

    const scanner = new ImportScanner();
    const scan = await scanner.scanFolder(root);

    const service = new ImportService();
    const staging = service.createStagingDir(tempDir());
    const progressUpdates: number[] = [];
    const result = await service.copyToStaging("folder", root, scan, staging, {
      onProgress: (u) => {
        progressUpdates.push(u.itemsProcessed);
      },
    });

    expect(result.filesCopied).toBe(scan.entries.length);
    expect(result.directoriesCopied).toBe(scan.directories.length);
    expect(progressUpdates.length).toBe(scan.entries.length);

    const copiedContent = await fs.readFile(path.join(staging, "readme.md"), "utf-8");
    expect(copiedContent).toContain("Sistema de trabajo");
    const stat = await fs.stat(path.join(staging, "readme.md"));
    expect(stat.mode & 0o777).toBe(0o640);

    const linkTarget = await fs.readlink(path.join(staging, "enlace.md"));
    expect(linkTarget).toBe(path.join(root, "readme.md"));

    const emptyDirStat = await fs.stat(path.join(staging, "carpeta-vacia"));
    expect(emptyDirStat.isDirectory()).toBe(true);
  });

  it("copyToStaging() con dryRun no escribe nada pero informa los conteos", async () => {
    const root = tempDir();
    await makeSampleSourceTree(root);
    const scanner = new ImportScanner();
    const scan = await scanner.scanFolder(root);

    const service = new ImportService();
    const staging = service.createStagingDir(tempDir());
    const result = await service.copyToStaging("folder", root, scan, staging, { dryRun: true });

    expect(result.filesCopied).toBe(scan.entries.length);
    await expect(fs.readdir(path.join(staging, "clientes"))).rejects.toBeDefined();
  });

  it("copyToStaging() desde un ZIP escribe el contenido de cada entrada", async () => {
    const root = tempDir();
    await makeSampleSourceTree(root);
    const zipPath = path.join(tempDir(), "origen.zip");
    await makeSampleZip(zipPath, root);

    const scanner = new ImportScanner();
    const scan = await scanner.scan("zip", zipPath);

    const service = new ImportService();
    const staging = service.createStagingDir(tempDir());
    const result = await service.copyToStaging("zip", zipPath, scan, staging);

    expect(result.filesCopied).toBe(scan.entries.length);
    const content = await fs.readFile(path.join(staging, ".env"), "utf-8");
    expect(content).toContain("SECRET");
  });

  it("copyToStaging() revierte el staging y lanza IMPORT_COPY_FAILED si el origen falla", async () => {
    const root = tempDir();
    await makeSampleSourceTree(root);
    const scanner = new ImportScanner();
    const scan = await scanner.scanFolder(root);
    await fs.rm(path.join(root, "readme.md"));

    const service = new ImportService();
    const staging = service.createStagingDir(tempDir());
    await expect(service.copyToStaging("folder", root, scan, staging)).rejects.toMatchObject({
      code: ImportErrorCode.IMPORT_COPY_FAILED,
    });
    await expect(fs.stat(staging)).rejects.toBeDefined();
  });

  it("copyToStaging() desde ZIP lanza IMPORT_COPY_FAILED si una entrada ya no está en el ZIP", async () => {
    const root = tempDir();
    await makeSampleSourceTree(root);
    const zipPath = path.join(tempDir(), "origen.zip");
    await makeSampleZip(zipPath, root);
    const scanner = new ImportScanner();
    const scan = await scanner.scan("zip", zipPath);
    const fakeScan = {
      ...scan,
      entries: [
        ...scan.entries,
        { relativePath: "no-existe.txt", size: 0, mtimeMs: 0, isHidden: false },
      ],
    };

    const service = new ImportService();
    const staging = service.createStagingDir(tempDir());
    await expect(service.copyToStaging("zip", zipPath, fakeScan, staging)).rejects.toMatchObject({
      code: ImportErrorCode.IMPORT_COPY_FAILED,
    });
  });

  it("destinationExists() detecta presencia y ausencia", async () => {
    const service = new ImportService();
    const root = tempDir();
    expect(await service.destinationExists(root)).toBe(true);
    expect(await service.destinationExists(`${root}/no-existe`)).toBe(false);
  });

  it("commitStaging() promueve el staging a un destino nuevo", async () => {
    const service = new ImportService();
    const staging = path.join(tempDir(), "staging");
    await fs.mkdir(staging, { recursive: true });
    await fs.writeFile(path.join(staging, "a.txt"), "contenido");
    const destination = path.join(tempDir(), "destino", "sub");

    await service.commitStaging(staging, destination, false);
    const content = await fs.readFile(path.join(destination, "a.txt"), "utf-8");
    expect(content).toBe("contenido");
  });

  it("commitStaging() lanza IMPORT_DESTINATION_EXISTS si el destino existe sin overwrite", async () => {
    const service = new ImportService();
    const staging = path.join(tempDir(), "staging");
    await fs.mkdir(staging, { recursive: true });
    const destination = tempDir();

    await expect(service.commitStaging(staging, destination, false)).rejects.toMatchObject({
      code: ImportErrorCode.IMPORT_DESTINATION_EXISTS,
    });
  });

  it("commitStaging() sustituye un destino existente cuando overwriteExisting es true", async () => {
    const service = new ImportService();
    const staging = path.join(tempDir(), "staging");
    await fs.mkdir(staging, { recursive: true });
    await fs.writeFile(path.join(staging, "nuevo.txt"), "nuevo");

    const destination = tempDir();
    await fs.writeFile(path.join(destination, "viejo.txt"), "viejo");

    await service.commitStaging(staging, destination, true);
    await expect(fs.stat(path.join(destination, "viejo.txt"))).rejects.toBeDefined();
    const content = await fs.readFile(path.join(destination, "nuevo.txt"), "utf-8");
    expect(content).toBe("nuevo");
  });

  it("rollbackStaging() elimina la carpeta de staging sin lanzar si no existe", async () => {
    const service = new ImportService();
    await expect(service.rollbackStaging(`${tempDir()}/no-existe`)).resolves.toBeUndefined();
  });

  it("copyToStaging() revierte el staging ante espacio insuficiente simulado (ENOSPC)", async () => {
    const root = tempDir();
    await makeSampleSourceTree(root);
    const scanner = new ImportScanner();
    const scan = await scanner.scanFolder(root);
    const stagingDir = path.join(tempDir(), "staging-enospc");

    const copyFileSpy = vi
      .spyOn(fs, "copyFile")
      .mockRejectedValueOnce(
        Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" })
      );

    const service = new ImportService();
    try {
      await expect(
        service.copyToStaging("folder", root, scan, stagingDir, {})
      ).rejects.toMatchObject({ code: ImportErrorCode.IMPORT_COPY_FAILED });
    } finally {
      copyFileSpy.mockRestore();
    }

    // El staging se descarta por completo: nunca queda una copia parcial.
    await expect(fs.access(stagingDir)).rejects.toBeDefined();
  });
});
