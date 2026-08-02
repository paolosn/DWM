import { describe, it, expect, afterEach } from "vitest";
import { MigrationStore } from "../../src/MigrationStore.js";
import { MigrationErrorCode } from "../../src/errors/MigrationErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

function makePersisted(migrationId: string) {
  return {
    migrationId,
    direction: "import" as const,
    request: { backupId: "b1" },
    createdAt: new Date().toISOString(),
    state: "completed" as const,
    warnings: [],
    errors: [],
  };
}

describe("MigrationStore", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("read() devuelve undefined si no existe; write()/read() persisten y recuperan", async () => {
    const store = new MigrationStore(`${tempDir()}/nested`);
    expect(await store.read("no-existe")).toBeUndefined();

    const persisted = makePersisted("m1");
    await store.write(persisted);
    expect(await store.read("m1")).toEqual(persisted);
  });

  it("listIds() devuelve los persistidos y [] si el directorio no existe", async () => {
    const store = new MigrationStore(`${tempDir()}/no-creado`);
    expect(await store.listIds()).toEqual([]);
    await store.write(makePersisted("uno"));
    expect(await store.listIds()).toEqual(["uno"]);
  });

  it("read() lanza MIGRATION_PERSISTENCE_FAILED ante contenido JSON inválido", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/roto.json`, "{ no es json", "utf-8");
    const store = new MigrationStore(dir);
    await expect(store.read("roto")).rejects.toMatchObject({
      code: MigrationErrorCode.MIGRATION_PERSISTENCE_FAILED,
    });
  });

  it("write() lanza MIGRATION_PERSISTENCE_FAILED ante un fallo real de escritura", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/no-es-directorio`;
    await fs.writeFile(conflictFile, "contenido");
    const store = new MigrationStore(`${conflictFile}/subdir`);
    await expect(store.write(makePersisted("x"))).rejects.toMatchObject({
      code: MigrationErrorCode.MIGRATION_PERSISTENCE_FAILED,
    });
  });

  it("listIds() lanza MIGRATION_PERSISTENCE_FAILED ante un fallo real distinto de ausencia", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/archivo`;
    await fs.writeFile(conflictFile, "contenido");
    const store = new MigrationStore(conflictFile);
    await expect(store.listIds()).rejects.toMatchObject({
      code: MigrationErrorCode.MIGRATION_PERSISTENCE_FAILED,
    });
  });
});
