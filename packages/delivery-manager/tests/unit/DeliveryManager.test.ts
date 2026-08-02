import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ImportManager } from "@dwm/import-manager";
import { DeliveryManager } from "../../src/DeliveryManager.js";
import { DeliveryErrorCode } from "../../src/errors/DeliveryErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeSampleDeliverySource } from "./support/fixtures.js";

describe("DeliveryManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  function makeManager(): DeliveryManager {
    return new DeliveryManager({ importManager: new ImportManager({ historyDir: tempDir() }) });
  }

  it("rechaza opciones sin importManager", () => {
    expect(() => new DeliveryManager({} as never)).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_INVALID_REQUEST })
    );
  });

  it("declara id, version y contractVersion como IModule", () => {
    const manager = makeManager();
    expect(manager.id).toBe("delivery-manager");
    expect(manager.version).toBe("1.0.0");
    expect(manager.contractVersion).toBe("1.0.0");
  });

  it("init()/dispose() no lanzan (sin recursos propios que gestionar)", async () => {
    const manager = makeManager();
    await expect(manager.init(undefined as never)).resolves.toBeUndefined();
    await expect(manager.dispose()).resolves.toBeUndefined();
  });

  it("importDelivery() registra la entrega y la deja como active", async () => {
    const manager = makeManager();
    const projectPath = tempDir();
    const sourcePath = tempDir();
    await makeSampleDeliverySource(sourcePath);

    const delivery = await manager.importDelivery({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder",
      sourcePath,
      label: "Inicial",
      deliveredAt: "2026-08-01T00:00:00.000Z",
    });

    expect(delivery.state).toBe("active");
    expect(delivery.path).toBe(path.join(projectPath, "ENTREGAS", "2026-08-01 Inicial"));
    await expect(fs.stat(delivery.path)).resolves.toBeDefined();
  });

  it("importDelivery() rechaza dryRun (no hay registro que promover)", async () => {
    const manager = makeManager();
    const projectPath = tempDir();
    const sourcePath = tempDir();
    await makeSampleDeliverySource(sourcePath);

    await expect(
      manager.importDelivery({
        projectId: "proyecto-1",
        projectPath,
        sourceType: "folder",
        sourcePath,
        label: "Inicial",
        dryRun: true,
      })
    ).rejects.toMatchObject({ code: DeliveryErrorCode.DELIVERY_INVALID_REQUEST });
  });

  it("una nueva entrega degrada la anterior active a superseded, manteniendo el histórico completo", async () => {
    const manager = makeManager();
    const projectPath = tempDir();
    const sourceA = tempDir();
    const sourceB = tempDir();
    await makeSampleDeliverySource(sourceA);
    await makeSampleDeliverySource(sourceB);
    await fs.writeFile(path.join(sourceB, "extra.txt"), "nuevo\n", "utf-8");

    await manager.importDelivery({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder",
      sourcePath: sourceA,
      label: "Inicial",
      deliveredAt: "2026-08-01T00:00:00.000Z",
    });
    const second = await manager.importDelivery({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder",
      sourcePath: sourceB,
      label: "Corrección",
      deliveredAt: "2026-08-15T00:00:00.000Z",
    });

    const history = await manager.getHistory(projectPath);
    expect(history).toHaveLength(2);
    const first = history.find((d) => d.label === "Inicial");
    const last = history.find((d) => d.label === "Corrección");
    expect(first?.state).toBe("superseded");
    expect(last?.state).toBe("active");
    expect(last?.id).toBe(second.id);

    const active = await manager.getActiveDelivery(projectPath);
    expect(active?.id).toBe(second.id);
  });

  it("listDeliveries() filtra por state, type y archived", async () => {
    const manager = makeManager();
    const projectPath = tempDir();
    const sourceA = tempDir();
    await makeSampleDeliverySource(sourceA);

    const delivery = await manager.importDelivery({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder",
      sourcePath: sourceA,
      label: "Inicial",
      type: "documentation",
    });

    expect(await manager.listDeliveries(projectPath, { state: "active" })).toHaveLength(1);
    expect(await manager.listDeliveries(projectPath, { state: "archived" })).toHaveLength(0);
    expect(await manager.listDeliveries(projectPath, { type: "documentation" })).toHaveLength(1);
    expect(await manager.listDeliveries(projectPath, { type: "database" })).toHaveLength(0);
    expect(await manager.listDeliveries(projectPath, { archived: false })).toHaveLength(1);
    expect(await manager.listDeliveries(projectPath, { archived: true })).toHaveLength(0);

    await manager.archiveDelivery(projectPath, delivery.id);
    expect(await manager.listDeliveries(projectPath, { archived: true })).toHaveLength(1);
  });

  it("getDelivery() valida el id y devuelve undefined si no existe", async () => {
    const manager = makeManager();
    const projectPath = tempDir();
    await expect(manager.getDelivery(projectPath, "a/b")).rejects.toMatchObject({
      code: DeliveryErrorCode.DELIVERY_INVALID_ID,
    });
    expect(await manager.getDelivery(projectPath, "no-existe")).toBeUndefined();
  });

  it("getActiveDelivery() devuelve undefined si no hay ninguna entrega", async () => {
    const manager = makeManager();
    expect(await manager.getActiveDelivery(tempDir())).toBeUndefined();
  });

  it("compareDeliveries() compara dos entregas del histórico y lanza si alguna no existe", async () => {
    const manager = makeManager();
    const projectPath = tempDir();
    const sourceA = tempDir();
    const sourceB = tempDir();
    await makeSampleDeliverySource(sourceA);
    await makeSampleDeliverySource(sourceB);
    await fs.writeFile(path.join(sourceB, "extra.txt"), "nuevo\n", "utf-8");

    const first = await manager.importDelivery({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder",
      sourcePath: sourceA,
      label: "Inicial",
      deliveredAt: "2026-08-01T00:00:00.000Z",
    });
    const second = await manager.importDelivery({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder",
      sourcePath: sourceB,
      label: "Corrección",
      deliveredAt: "2026-08-15T00:00:00.000Z",
    });

    const comparison = await manager.compareDeliveries(projectPath, first.id, second.id);
    expect(comparison.hashMatch).toBe(false);
    expect(comparison.fileCountDelta).toBe(1);

    await expect(
      manager.compareDeliveries(projectPath, first.id, "no-existe")
    ).rejects.toMatchObject({
      code: DeliveryErrorCode.DELIVERY_NOT_FOUND,
    });
  });

  it("archiveDelivery() archiva una entrega sin promover automáticamente otra a active", async () => {
    const manager = makeManager();
    const projectPath = tempDir();
    const sourcePath = tempDir();
    await makeSampleDeliverySource(sourcePath);

    const delivery = await manager.importDelivery({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder",
      sourcePath,
      label: "Inicial",
    });

    const archived = await manager.archiveDelivery(projectPath, delivery.id, {
      notes: "cerrada tras validación",
    });
    expect(archived.state).toBe("archived");
    expect(archived.notes).toBe("cerrada tras validación");
    expect(await manager.getActiveDelivery(projectPath)).toBeUndefined();
  });

  it("verifyIntegrity() detecta que una entrega no se ha modificado, y que sí se ha modificado", async () => {
    const manager = makeManager();
    const projectPath = tempDir();
    const sourcePath = tempDir();
    await makeSampleDeliverySource(sourcePath);

    const delivery = await manager.importDelivery({
      projectId: "proyecto-1",
      projectPath,
      sourceType: "folder",
      sourcePath,
      label: "Inicial",
    });

    const intact = await manager.verifyIntegrity(projectPath, delivery.id);
    expect(intact.valid).toBe(true);
    expect(intact.issues).toHaveLength(0);

    await fs.writeFile(path.join(delivery.path, "readme.md"), "# manipulado\n", "utf-8");
    const tampered = await manager.verifyIntegrity(projectPath, delivery.id);
    expect(tampered.valid).toBe(false);
    expect(tampered.issues.length).toBeGreaterThan(0);
    expect(tampered.currentHash).not.toBe(tampered.storedHash);
  });
});
