import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ImportManager } from "@dwm/import-manager";
import { DeliveryImporter } from "../../src/DeliveryImporter.js";
import { DeliveryRepository } from "../../src/DeliveryRepository.js";
import { DeliveryErrorCode } from "../../src/errors/DeliveryErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeSampleDeliverySource, makeSampleZip } from "./support/fixtures.js";

describe("DeliveryImporter", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  function makeImporter(): { importer: DeliveryImporter; repository: DeliveryRepository } {
    const repository = new DeliveryRepository();
    const importManager = new ImportManager({ historyDir: tempDir() });
    return { importer: new DeliveryImporter(importManager, repository), repository };
  }

  it("importa una carpeta como entrega nueva bajo ENTREGAS/", async () => {
    const { importer, repository } = makeImporter();
    const projectPath = tempDir();
    const sourcePath = tempDir();
    await makeSampleDeliverySource(sourcePath);

    const outcome = await importer.import({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder",
      sourcePath,
      label: "Inicial",
      deliveredAt: "2026-08-01T00:00:00.000Z",
    });

    expect(outcome.record).toBeDefined();
    expect(outcome.record?.folderName).toBe("2026-08-01 Inicial");
    expect(outcome.record?.type).toBe("folder");
    expect(outcome.record?.state).toBe("active");
    expect(outcome.record?.fileCount).toBe(4);
    expect(outcome.record?.hash).toMatch(/^[a-f0-9]{64}$/);

    const deliveryDir = repository.deliveryDir(projectPath, "2026-08-01 Inicial");
    await expect(fs.stat(path.join(deliveryDir, "readme.md"))).resolves.toBeDefined();
    const sidecar = await repository.readMetadata(projectPath, "2026-08-01 Inicial");
    expect(sidecar).toEqual(outcome.record);
  });

  it("importa un ZIP como entrega nueva, con type por defecto 'zip'", async () => {
    const { importer, repository } = makeImporter();
    const projectPath = tempDir();
    const sourceTree = tempDir();
    await makeSampleDeliverySource(sourceTree);
    const zipPath = path.join(tempDir(), "entrega.zip");
    await makeSampleZip(zipPath, sourceTree);

    const outcome = await importer.import({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "zip",
      sourcePath: zipPath,
      label: "Corrección",
      deliveredAt: "2026-08-15T00:00:00.000Z",
    });

    expect(outcome.record?.folderName).toBe("2026-08-15 Corrección");
    expect(outcome.record?.type).toBe("zip");
    expect(outcome.record?.fileCount).toBe(4);

    const deliveryDir = repository.deliveryDir(projectPath, "2026-08-15 Corrección");
    await expect(fs.stat(path.join(deliveryDir, "readme.md"))).resolves.toBeDefined();
  });

  it("respeta un type de negocio explícito distinto de la forma física del origen", async () => {
    const { importer } = makeImporter();
    const projectPath = tempDir();
    const sourcePath = tempDir();
    await makeSampleDeliverySource(sourcePath);

    const outcome = await importer.import({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder",
      sourcePath,
      label: "Producción",
      type: "source_code",
    });

    expect(outcome.record?.type).toBe("source_code");
  });

  it("nunca sobrescribe: una segunda importación al mismo folderName falla", async () => {
    const { importer } = makeImporter();
    const projectPath = tempDir();
    const sourcePath = tempDir();
    await makeSampleDeliverySource(sourcePath);

    const request = {
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder" as const,
      sourcePath,
      label: "Inicial",
      deliveredAt: "2026-08-01T00:00:00.000Z",
    };
    await importer.import(request);

    await expect(importer.import(request)).rejects.toMatchObject({
      code: DeliveryErrorCode.DELIVERY_ALREADY_EXISTS,
    });
  });

  it("dryRun valida y escanea sin escribir nada en disco ni registrar la entrega", async () => {
    const { importer, repository } = makeImporter();
    const projectPath = tempDir();
    const sourcePath = tempDir();
    await makeSampleDeliverySource(sourcePath);

    const outcome = await importer.import({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder",
      sourcePath,
      label: "Inicial",
      deliveredAt: "2026-08-01T00:00:00.000Z",
      dryRun: true,
    });

    expect(outcome.record).toBeUndefined();
    expect(outcome.importResult.dryRun).toBe(true);
    expect(await repository.exists(projectPath, "2026-08-01 Inicial")).toBe(false);
  });

  it("envuelve un fallo del motor de importación en DELIVERY_IMPORT_FAILED", async () => {
    const { importer } = makeImporter();
    const projectPath = tempDir();

    await expect(
      importer.import({
        projectId: "proyecto-1",
        projectPath,
        sourceType: "folder",
        sourcePath: path.join(tempDir(), "no-existe"),
        label: "Inicial",
      })
    ).rejects.toMatchObject({ code: DeliveryErrorCode.DELIVERY_IMPORT_FAILED });
  });
});
