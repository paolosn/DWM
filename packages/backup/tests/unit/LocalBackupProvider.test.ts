import { describe, it, expect, afterEach } from "vitest";
import { LocalBackupProvider } from "../../src/LocalBackupProvider.js";
import { BackupErrorCode } from "../../src/errors/BackupErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("LocalBackupProvider", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("write()/read()/exists() funcionan de extremo a extremo", async () => {
    const provider = new LocalBackupProvider(tempDir());
    const target = { providerId: "local", path: "dest" };
    expect(await provider.exists(target, "b1")).toBe(false);

    await provider.write(target, "b1", '{"x":1}');

    expect(await provider.exists(target, "b1")).toBe(true);
    expect(await provider.read(target, "b1")).toBe('{"x":1}');
  });

  it("read() devuelve undefined si no existe", async () => {
    const provider = new LocalBackupProvider(tempDir());
    await expect(
      provider.read({ providerId: "local", path: "dest" }, "no-existe")
    ).resolves.toBeUndefined();
  });

  it("rechaza rutas de destino fuera del directorio permitido (path traversal)", async () => {
    const provider = new LocalBackupProvider(tempDir());
    await expect(
      provider.write({ providerId: "local", path: "../fuera" }, "b1", "x")
    ).rejects.toMatchObject({
      code: BackupErrorCode.BACKUP_UNSAFE_PATH,
    });
  });

  it("rechaza claves de backup inseguras", async () => {
    const provider = new LocalBackupProvider(tempDir());
    await expect(
      provider.write({ providerId: "local", path: "dest" }, "../fuera", "x")
    ).rejects.toMatchObject({
      code: BackupErrorCode.BACKUP_UNSAFE_PATH,
    });
  });

  it("delete() elimina y es idempotente si ya no existe", async () => {
    const provider = new LocalBackupProvider(tempDir());
    const target = { providerId: "local", path: "dest" };
    await provider.write(target, "b1", "x");
    await provider.delete(target, "b1");
    expect(await provider.exists(target, "b1")).toBe(false);
    await expect(provider.delete(target, "b1")).resolves.toBeUndefined();
  });

  it("list() devuelve las claves almacenadas y [] si el directorio no existe", async () => {
    const dir = tempDir();
    const provider = new LocalBackupProvider(dir);
    const target = { providerId: "local", path: "no-creado" };
    expect(await provider.list(target)).toEqual([]);

    await provider.write(target, "uno", "x");
    await provider.write(target, "dos", "y");
    expect((await provider.list(target)).sort()).toEqual(["dos", "uno"]);
  });

  it("getMetadata() devuelve el tamaño en bytes y undefined si no existe", async () => {
    const provider = new LocalBackupProvider(tempDir());
    const target = { providerId: "local", path: "dest" };
    await provider.write(target, "b1", "0123456789");
    const metadata = await provider.getMetadata(target, "b1");
    expect(metadata?.sizeBytes).toBe(10);
    expect(await provider.getMetadata(target, "no-existe")).toBeUndefined();
  });

  it("checkCapacity() siempre concede espacio", async () => {
    const provider = new LocalBackupProvider(tempDir());
    await expect(provider.checkCapacity()).resolves.toBe(true);
  });

  it("write() lanza BACKUP_WRITE_FAILED ante un fallo real de escritura", async () => {
    const dir = tempDir();
    const provider = new LocalBackupProvider(dir);
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/no-es-directorio`;
    await fs.writeFile(conflictFile, "contenido");

    await expect(
      provider.write({ providerId: "local", path: "no-es-directorio/subdir" }, "b1", "x")
    ).rejects.toMatchObject({ code: BackupErrorCode.BACKUP_WRITE_FAILED });
  });

  it("delete() lanza BACKUP_PROVIDER_ERROR ante un fallo real distinto de ausencia", async () => {
    const dir = tempDir();
    const provider = new LocalBackupProvider(dir);
    const fs = await import("node:fs/promises");
    await fs.mkdir(`${dir}/dest`, { recursive: true });
    await fs.mkdir(`${dir}/dest/x.json`, { recursive: true });

    await expect(provider.delete({ providerId: "local", path: "dest" }, "x")).rejects.toMatchObject(
      {
        code: BackupErrorCode.BACKUP_PROVIDER_ERROR,
      }
    );
  });

  it("list() lanza ante una ruta insegura", async () => {
    const provider = new LocalBackupProvider(tempDir());
    await expect(provider.list({ providerId: "local", path: "../fuera" })).rejects.toMatchObject({
      code: BackupErrorCode.BACKUP_UNSAFE_PATH,
    });
  });
});
