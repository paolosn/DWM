import { describe, it, expect, afterEach } from "vitest";
import { ProfileStore } from "../../src/ProfileStore.js";
import { createInitialProfileMetadata } from "../../src/ProfileMetadata.js";
import { defaultProfileConfiguration } from "../../src/ProfileConfiguration.js";
import { ProfileErrorCode } from "../../src/errors/ProfileErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("ProfileStore", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  it("read() devuelve undefined si no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ProfileStore(dir);
    expect(await store.read("no-existe")).toBeUndefined();
  });

  it("write() crea el directorio y read() recupera lo persistido", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ProfileStore(`${dir}/nested`);
    const metadata = createInitialProfileMetadata("p1", "Perfil", "desc");
    const configuration = defaultProfileConfiguration();
    await store.write({ metadata, configuration });
    expect(await store.read("p1")).toEqual({ metadata, configuration });
  });

  it("delete() elimina; es idempotente si ya no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ProfileStore(dir);
    await store.write({
      metadata: createInitialProfileMetadata("p1", "n", "d"),
      configuration: defaultProfileConfiguration(),
    });
    await store.delete("p1");
    expect(await store.read("p1")).toBeUndefined();
    await expect(store.delete("p1")).resolves.toBeUndefined();
  });

  it("listIds() devuelve los persistidos y [] si el directorio no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ProfileStore(`${dir}/no-creado`);
    expect(await store.listIds()).toEqual([]);

    await store.write({
      metadata: createInitialProfileMetadata("uno", "n", "d"),
      configuration: defaultProfileConfiguration(),
    });
    await store.write({
      metadata: createInitialProfileMetadata("dos", "n", "d"),
      configuration: defaultProfileConfiguration(),
    });
    expect((await store.listIds()).sort()).toEqual(["dos", "uno"]);
  });

  it("read() lanza PROFILE_LOAD_FAILED si el contenido no es JSON válido", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/roto.json`, "{ no es json", "utf-8");

    const store = new ProfileStore(dir);
    await expect(store.read("roto")).rejects.toMatchObject({
      code: ProfileErrorCode.PROFILE_LOAD_FAILED,
    });
  });

  it("write() lanza PROFILE_SAVE_FAILED ante un fallo real de escritura", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/no-es-directorio`;
    await fs.writeFile(conflictFile, "contenido");

    const store = new ProfileStore(`${conflictFile}/subdir`);
    await expect(
      store.write({
        metadata: createInitialProfileMetadata("x", "n", "d"),
        configuration: defaultProfileConfiguration(),
      })
    ).rejects.toMatchObject({ code: ProfileErrorCode.PROFILE_SAVE_FAILED });
  });

  it("delete() lanza PROFILE_DELETE_FAILED ante un fallo real distinto de ausencia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    await fs.mkdir(`${dir}/x.json`, { recursive: true });

    const store = new ProfileStore(dir);
    await expect(store.delete("x")).rejects.toMatchObject({
      code: ProfileErrorCode.PROFILE_DELETE_FAILED,
    });
  });

  it("listIds() lanza PROFILE_LOAD_FAILED ante un fallo real distinto de ausencia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/archivo`;
    await fs.writeFile(conflictFile, "contenido");

    const store = new ProfileStore(conflictFile);
    await expect(store.listIds()).rejects.toMatchObject({
      code: ProfileErrorCode.PROFILE_LOAD_FAILED,
    });
  });
});
