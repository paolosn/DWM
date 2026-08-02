import { describe, it, expect, afterEach } from "vitest";
import { StatusStore } from "../../src/StatusStore.js";
import { StatusErrorCode } from "../../src/errors/StatusErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

function makeSnapshot(snapshotId: string) {
  return {
    snapshotId,
    level: "OK" as const,
    generatedAt: new Date().toISOString(),
    reports: [],
  };
}

describe("StatusStore", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("read() devuelve undefined si no existe; write()/read() persisten y recuperan", async () => {
    const store = new StatusStore(`${tempDir()}/nested`);
    expect(await store.read("no-existe")).toBeUndefined();

    const snapshot = makeSnapshot("s1");
    await store.write(snapshot);
    expect(await store.read("s1")).toEqual(snapshot);
  });

  it("listIds() devuelve los persistidos y [] si el directorio no existe", async () => {
    const store = new StatusStore(`${tempDir()}/no-creado`);
    expect(await store.listIds()).toEqual([]);
    await store.write(makeSnapshot("uno"));
    expect(await store.listIds()).toEqual(["uno"]);
  });

  it("read() lanza STATUS_PERSISTENCE_FAILED ante contenido JSON inválido", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/roto.json`, "{ no es json", "utf-8");
    const store = new StatusStore(dir);
    await expect(store.read("roto")).rejects.toMatchObject({
      code: StatusErrorCode.STATUS_PERSISTENCE_FAILED,
    });
  });

  it("write() lanza STATUS_PERSISTENCE_FAILED ante un fallo real de escritura", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/no-es-directorio`;
    await fs.writeFile(conflictFile, "contenido");
    const store = new StatusStore(`${conflictFile}/subdir`);
    await expect(store.write(makeSnapshot("x"))).rejects.toMatchObject({
      code: StatusErrorCode.STATUS_PERSISTENCE_FAILED,
    });
  });

  it("listIds() lanza STATUS_PERSISTENCE_FAILED ante un fallo real distinto de ausencia", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/archivo`;
    await fs.writeFile(conflictFile, "contenido");
    const store = new StatusStore(conflictFile);
    await expect(store.listIds()).rejects.toMatchObject({
      code: StatusErrorCode.STATUS_PERSISTENCE_FAILED,
    });
  });
});
