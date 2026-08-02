import { describe, it, expect, afterEach } from "vitest";
import { ProjectStore } from "../../src/ProjectStore.js";
import { createInitialProjectMetadata } from "../../src/ProjectMetadata.js";
import { ProjectErrorCode } from "../../src/errors/ProjectErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

const CONFIG = { projectPath: "/tmp/x", profileId: "p1", usedTools: [], usedAdapters: [] };

describe("ProjectStore", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  it("read() devuelve undefined si no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ProjectStore(dir);
    expect(await store.read("no-existe")).toBeUndefined();
  });

  it("write() crea el directorio y read() recupera lo persistido", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ProjectStore(`${dir}/nested`);
    const metadata = createInitialProjectMetadata("p1", "Proyecto", "desc");
    await store.write({ metadata, configuration: CONFIG });
    expect(await store.read("p1")).toEqual({ metadata, configuration: CONFIG });
  });

  it("delete() elimina; es idempotente si ya no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ProjectStore(dir);
    await store.write({
      metadata: createInitialProjectMetadata("p1", "n", "d"),
      configuration: CONFIG,
    });
    await store.delete("p1");
    expect(await store.read("p1")).toBeUndefined();
    await expect(store.delete("p1")).resolves.toBeUndefined();
  });

  it("listIds() devuelve los persistidos y [] si el directorio no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ProjectStore(`${dir}/no-creado`);
    expect(await store.listIds()).toEqual([]);

    await store.write({
      metadata: createInitialProjectMetadata("uno", "n", "d"),
      configuration: CONFIG,
    });
    await store.write({
      metadata: createInitialProjectMetadata("dos", "n", "d"),
      configuration: CONFIG,
    });
    expect((await store.listIds()).sort()).toEqual(["dos", "uno"]);
  });

  it("read() lanza PROJECT_LOAD_FAILED si el contenido no es JSON válido", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/roto.json`, "{ no es json", "utf-8");

    const store = new ProjectStore(dir);
    await expect(store.read("roto")).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_LOAD_FAILED,
    });
  });

  it("write() lanza PROJECT_SAVE_FAILED ante un fallo real de escritura", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/no-es-directorio`;
    await fs.writeFile(conflictFile, "contenido");

    const store = new ProjectStore(`${conflictFile}/subdir`);
    await expect(
      store.write({ metadata: createInitialProjectMetadata("x", "n", "d"), configuration: CONFIG })
    ).rejects.toMatchObject({ code: ProjectErrorCode.PROJECT_SAVE_FAILED });
  });

  it("delete() lanza PROJECT_DELETE_FAILED ante un fallo real distinto de ausencia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    await fs.mkdir(`${dir}/x.json`, { recursive: true });

    const store = new ProjectStore(dir);
    await expect(store.delete("x")).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_DELETE_FAILED,
    });
  });

  it("listIds() lanza PROJECT_LOAD_FAILED ante un fallo real distinto de ausencia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/archivo`;
    await fs.writeFile(conflictFile, "contenido");

    const store = new ProjectStore(conflictFile);
    await expect(store.listIds()).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_LOAD_FAILED,
    });
  });
});
