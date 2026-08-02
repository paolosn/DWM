import { describe, it, expect, afterEach } from "vitest";
import { SecretStore } from "../../src/SecretStore.js";
import { createInitialEntry } from "../../src/SecretEntry.js";
import { SecretErrorCode } from "../../src/errors/SecretErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("SecretStore", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  it("read() devuelve undefined si no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new SecretStore(dir);
    expect(await store.read("no-existe")).toBeUndefined();
  });

  it("write() crea el directorio y read() recupera la entrada", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new SecretStore(`${dir}/nested`);
    const entry = createInitialEntry("api-key", "cipher-opaco");
    await store.write(entry);
    expect(await store.read("api-key")).toEqual(entry);
  });

  it("delete() elimina la entrada; es idempotente si ya no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new SecretStore(dir);
    await store.write(createInitialEntry("x", "c"));
    await store.delete("x");
    expect(await store.read("x")).toBeUndefined();
    await expect(store.delete("x")).resolves.toBeUndefined();
  });

  it("listKeys() devuelve las claves persistidas y [] si el directorio no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new SecretStore(`${dir}/no-creado`);
    expect(await store.listKeys()).toEqual([]);

    await store.write(createInitialEntry("uno", "c"));
    await store.write(createInitialEntry("dos", "c"));
    expect((await store.listKeys()).sort()).toEqual(["dos", "uno"]);
  });

  it("read() lanza SECRETS_LOAD_FAILED si el contenido no es JSON válido", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/roto.json`, "{ no es json", "utf-8");

    const store = new SecretStore(dir);
    await expect(store.read("roto")).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_LOAD_FAILED,
    });
  });

  it("write()/read()/delete() rechazan una clave inválida", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new SecretStore(dir);
    await expect(store.write(createInitialEntry("a/b", "c"))).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_INVALID_KEY,
    });
    await expect(store.read("a/b")).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_INVALID_KEY,
    });
    await expect(store.delete("a/b")).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_INVALID_KEY,
    });
  });

  it("write() lanza SECRETS_SAVE_FAILED ante un fallo real de escritura", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/no-es-directorio`;
    await fs.writeFile(conflictFile, "contenido");

    const store = new SecretStore(`${conflictFile}/subdir`);
    await expect(store.write(createInitialEntry("x", "c"))).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_SAVE_FAILED,
    });
  });

  it("delete() lanza SECRETS_DELETE_FAILED ante un fallo real distinto de ausencia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    await fs.mkdir(`${dir}/x.json`, { recursive: true });

    const store = new SecretStore(dir);
    await expect(store.delete("x")).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_DELETE_FAILED,
    });
  });

  it("listKeys() lanza SECRETS_LOAD_FAILED ante un fallo real distinto de ausencia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/archivo`;
    await fs.writeFile(conflictFile, "contenido");

    const store = new SecretStore(conflictFile);
    await expect(store.listKeys()).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_LOAD_FAILED,
    });
  });
});
