import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { DeliveryRepository } from "../../src/DeliveryRepository.js";
import { createInitialDeliveryDwmMetadata } from "../../src/DeliveryMetadata.js";
import { DeliveryErrorCode } from "../../src/errors/DeliveryErrorCode.js";
import type { DeliveryRecord } from "../../src/DeliveryTypes.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeSampleDeliverySource } from "./support/fixtures.js";

describe("DeliveryRepository", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  const repository = new DeliveryRepository();

  function makeRecord(folderName: string, overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
    return {
      id: "id-1",
      projectId: "proyecto-1",
      folderName,
      label: "Inicial",
      type: "folder",
      state: "active",
      origin: "/tmp/origen",
      hash: "hash",
      sizeBytes: 0,
      fileCount: 0,
      directoryCount: 0,
      deliveredAt: "2026-08-01T00:00:00.000Z",
      importedAt: "2026-08-01T00:00:00.000Z",
      dwm: createInitialDeliveryDwmMetadata(),
      ...overrides,
    };
  }

  it("entregasDir() resuelve ENTREGAS bajo la raíz del proyecto", () => {
    const projectPath = tempDir();
    expect(repository.entregasDir(projectPath)).toBe(path.join(projectPath, "ENTREGAS"));
  });

  it("deliveryDir() rechaza un folderName que escapa de ENTREGAS/ por traversal", () => {
    const projectPath = tempDir();
    expect(() => repository.deliveryDir(projectPath, "../fuera")).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_UNSAFE_PATH })
    );
  });

  it("exists() devuelve false si ENTREGAS/ ni siquiera existe, y true tras crear la carpeta", async () => {
    const projectPath = tempDir();
    expect(await repository.exists(projectPath, "2026-08-01 Inicial")).toBe(false);
    await fs.mkdir(repository.deliveryDir(projectPath, "2026-08-01 Inicial"), { recursive: true });
    expect(await repository.exists(projectPath, "2026-08-01 Inicial")).toBe(true);
  });

  it("listFolderNames() devuelve [] si ENTREGAS/ no existe, y las carpetas ordenadas si existen", async () => {
    const projectPath = tempDir();
    expect(await repository.listFolderNames(projectPath)).toEqual([]);

    const entregas = repository.entregasDir(projectPath);
    await fs.mkdir(path.join(entregas, "2026-08-15 Correccion"), { recursive: true });
    await fs.mkdir(path.join(entregas, "2026-08-01 Inicial"), { recursive: true });
    await fs.writeFile(path.join(entregas, "no-es-carpeta.txt"), "x", "utf-8");

    expect(await repository.listFolderNames(projectPath)).toEqual([
      "2026-08-01 Inicial",
      "2026-08-15 Correccion",
    ]);
  });

  it("writeMetadata() y readMetadata() hacen round-trip del sidecar", async () => {
    const projectPath = tempDir();
    const folderName = "2026-08-01 Inicial";
    await fs.mkdir(repository.deliveryDir(projectPath, folderName), { recursive: true });
    const record = makeRecord(folderName);

    await repository.writeMetadata(projectPath, record);
    const read = await repository.readMetadata(projectPath, folderName);
    expect(read).toEqual(record);
  });

  it("readMetadata() devuelve undefined si el sidecar no existe", async () => {
    const projectPath = tempDir();
    const folderName = "2026-08-01 Inicial";
    await fs.mkdir(repository.deliveryDir(projectPath, folderName), { recursive: true });
    expect(await repository.readMetadata(projectPath, folderName)).toBeUndefined();
  });

  it("readMetadata() lanza DELIVERY_INVALID_STRUCTURE si el JSON está mal formado", async () => {
    const projectPath = tempDir();
    const folderName = "2026-08-01 Inicial";
    const deliveryDir = repository.deliveryDir(projectPath, folderName);
    await fs.mkdir(deliveryDir, { recursive: true });
    await fs.writeFile(path.join(deliveryDir, ".dwm-delivery.json"), "{ mal json", "utf-8");

    await expect(repository.readMetadata(projectPath, folderName)).rejects.toMatchObject({
      code: DeliveryErrorCode.DELIVERY_INVALID_STRUCTURE,
    });
  });

  it("readMetadata() lanza DELIVERY_INVALID_STRUCTURE si al sidecar le falta un campo obligatorio", async () => {
    const projectPath = tempDir();
    const folderName = "2026-08-01 Inicial";
    const deliveryDir = repository.deliveryDir(projectPath, folderName);
    await fs.mkdir(deliveryDir, { recursive: true });
    await fs.writeFile(
      path.join(deliveryDir, ".dwm-delivery.json"),
      JSON.stringify({ id: "x" }),
      "utf-8"
    );

    await expect(repository.readMetadata(projectPath, folderName)).rejects.toMatchObject({
      code: DeliveryErrorCode.DELIVERY_INVALID_STRUCTURE,
    });
  });

  it("computeDigest() calcula tamaño, recuento de ficheros/carpetas y hash determinista, excluyendo el sidecar", async () => {
    const projectPath = tempDir();
    const folderName = "2026-08-01 Inicial";
    const deliveryDir = repository.deliveryDir(projectPath, folderName);
    await fs.mkdir(deliveryDir, { recursive: true });
    await makeSampleDeliverySource(deliveryDir);
    // El sidecar de metadatos, si ya existiera, no debe influir en el hash.
    await fs.writeFile(path.join(deliveryDir, ".dwm-delivery.json"), "{}", "utf-8");

    const digest = await repository.computeDigest(deliveryDir);
    expect(digest.fileCount).toBe(4);
    expect(digest.directoryCount).toBe(2);
    expect(digest.sizeBytes).toBeGreaterThan(0);
    expect(digest.hash).toMatch(/^[a-f0-9]{64}$/);

    const digestAgain = await repository.computeDigest(deliveryDir);
    expect(digestAgain.hash).toBe(digest.hash);
  });

  it("computeDigest() detecta un cambio de contenido en el hash resultante", async () => {
    const projectPath = tempDir();
    const deliveryDir = repository.deliveryDir(projectPath, "2026-08-01 Inicial");
    await fs.mkdir(deliveryDir, { recursive: true });
    await makeSampleDeliverySource(deliveryDir);
    const before = await repository.computeDigest(deliveryDir);

    await fs.writeFile(path.join(deliveryDir, "readme.md"), "# Cambiado\n", "utf-8");
    const after = await repository.computeDigest(deliveryDir);

    expect(after.hash).not.toBe(before.hash);
  });
});
