import { describe, it, expect, afterEach } from "vitest";
import { ConfigStore } from "../../src/ConfigStore.js";
import { ConfigErrorCode } from "../../src/errors/ConfigErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("ConfigStore", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  it("read() devuelve undefined si la sección no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ConfigStore(dir);
    expect(await store.read("no-existe")).toBeUndefined();
  });

  it("write() crea el directorio y read() recupera el valor", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ConfigStore(`${dir}/nested`);
    await store.write("secrets", { apiKey: "x" });
    expect(await store.read("secrets")).toEqual({ apiKey: "x" });
  });

  it("delete() elimina la sección; es idempotente si ya no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ConfigStore(dir);
    await store.write("a", { x: 1 });
    await store.delete("a");
    expect(await store.read("a")).toBeUndefined();
    await expect(store.delete("a")).resolves.toBeUndefined();
  });

  it("listNamespaces() devuelve las secciones persistidas y [] si el directorio no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ConfigStore(`${dir}/no-creado-aun`);
    expect(await store.listNamespaces()).toEqual([]);

    await store.write("uno", {});
    await store.write("dos", {});
    expect((await store.listNamespaces()).sort()).toEqual(["dos", "uno"]);
  });

  it("read() lanza CONFIG_LOAD_FAILED si el contenido no es JSON válido", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/roto.json`, "{ no es json", "utf-8");

    const store = new ConfigStore(dir);
    await expect(store.read("roto")).rejects.toMatchObject({
      code: ConfigErrorCode.CONFIG_LOAD_FAILED,
    });
  });

  it("write()/read()/delete() rechazan un namespace inválido", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new ConfigStore(dir);
    await expect(store.write("a/b", {})).rejects.toMatchObject({
      code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE,
    });
    await expect(store.read("a/b")).rejects.toMatchObject({
      code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE,
    });
    await expect(store.delete("a/b")).rejects.toMatchObject({
      code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE,
    });
  });

  it("write() lanza CONFIG_SAVE_FAILED ante un fallo real de escritura", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/no-es-directorio`;
    await fs.writeFile(conflictFile, "contenido");

    const store = new ConfigStore(`${conflictFile}/subdir`);
    await expect(store.write("x", {})).rejects.toMatchObject({
      code: ConfigErrorCode.CONFIG_SAVE_FAILED,
    });
  });

  it("delete() lanza CONFIG_DELETE_FAILED ante un fallo real distinto de ausencia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    // Un directorio con el mismo nombre que la clave provoca EISDIR al hacer unlink.
    await fs.mkdir(`${dir}/x.json`, { recursive: true });

    const store = new ConfigStore(dir);
    await expect(store.delete("x")).rejects.toMatchObject({
      code: ConfigErrorCode.CONFIG_DELETE_FAILED,
    });
  });

  it("listNamespaces() lanza CONFIG_LOAD_FAILED ante un fallo real distinto de ausencia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/archivo`;
    await fs.writeFile(conflictFile, "contenido");

    const store = new ConfigStore(conflictFile);
    await expect(store.listNamespaces()).rejects.toMatchObject({
      code: ConfigErrorCode.CONFIG_LOAD_FAILED,
    });
  });
});
