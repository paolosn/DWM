import { describe, it, expect, afterEach } from "vitest";
import { BackupStore } from "../../src/BackupStore.js";
import { BACKUP_FORMAT_VERSION, type BackupManifest } from "../../src/BackupManifest.js";
import { defaultBackupPolicy } from "../../src/BackupPolicy.js";
import { BackupErrorCode } from "../../src/errors/BackupErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

function makeManifest(id: string): BackupManifest {
  return {
    id,
    type: "full",
    createdAt: new Date().toISOString(),
    includedResources: [],
    excludedPaths: [],
    target: { providerId: "local", path: "dest" },
    providerId: "local",
    formatVersion: BACKUP_FORMAT_VERSION,
  };
}

describe("BackupStore", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("read() devuelve undefined si no existe; write()/read() persisten y recuperan", async () => {
    const store = new BackupStore(`${tempDir()}/nested`);
    expect(await store.read("no-existe")).toBeUndefined();

    const persisted = {
      manifest: makeManifest("b1"),
      state: "completed" as const,
      policy: defaultBackupPolicy(),
      warnings: [],
      errors: [],
    };
    await store.write(persisted);
    expect(await store.read("b1")).toEqual(persisted);
  });

  it("delete() elimina; es idempotente si ya no existe", async () => {
    const store = new BackupStore(tempDir());
    await store.write({
      manifest: makeManifest("b1"),
      state: "completed",
      policy: defaultBackupPolicy(),
      warnings: [],
      errors: [],
    });
    await store.delete("b1");
    expect(await store.read("b1")).toBeUndefined();
    await expect(store.delete("b1")).resolves.toBeUndefined();
  });

  it("listIds() devuelve los persistidos y [] si el directorio no existe", async () => {
    const store = new BackupStore(`${tempDir()}/no-creado`);
    expect(await store.listIds()).toEqual([]);
    await store.write({
      manifest: makeManifest("uno"),
      state: "completed",
      policy: defaultBackupPolicy(),
      warnings: [],
      errors: [],
    });
    expect(await store.listIds()).toEqual(["uno"]);
  });

  it("read() lanza BACKUP_PERSISTENCE_FAILED ante contenido JSON inválido", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/roto.json`, "{ no es json", "utf-8");
    const store = new BackupStore(dir);
    await expect(store.read("roto")).rejects.toMatchObject({
      code: BackupErrorCode.BACKUP_PERSISTENCE_FAILED,
    });
  });

  it("write() lanza BACKUP_PERSISTENCE_FAILED ante un fallo real de escritura", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/no-es-directorio`;
    await fs.writeFile(conflictFile, "contenido");
    const store = new BackupStore(`${conflictFile}/subdir`);
    await expect(
      store.write({
        manifest: makeManifest("x"),
        state: "completed",
        policy: defaultBackupPolicy(),
        warnings: [],
        errors: [],
      })
    ).rejects.toMatchObject({ code: BackupErrorCode.BACKUP_PERSISTENCE_FAILED });
  });

  it("delete()/listIds() lanzan BACKUP_PERSISTENCE_FAILED ante un fallo real distinto de ausencia", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    await fs.mkdir(`${dir}/x.json`, { recursive: true });
    const store = new BackupStore(dir);
    await expect(store.delete("x")).rejects.toMatchObject({
      code: BackupErrorCode.BACKUP_PERSISTENCE_FAILED,
    });

    const conflictFile = `${dir}2/archivo`;
    await fs.mkdir(`${dir}2`, { recursive: true });
    await fs.writeFile(conflictFile, "contenido");
    const store2 = new BackupStore(conflictFile);
    await expect(store2.listIds()).rejects.toMatchObject({
      code: BackupErrorCode.BACKUP_PERSISTENCE_FAILED,
    });
  });
});
