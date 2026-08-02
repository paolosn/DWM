import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { FileSystemStorageProvider } from "../src/config/FileSystemStorageProvider.js";

describe("FileSystemStorageProvider", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-core-fs-"));
    dirs.push(dir);
    return dir;
  }

  it("read() devuelve null si la clave no existe", async () => {
    const provider = new FileSystemStorageProvider(tempDir());
    expect(await provider.read("no-existe.json")).toBeNull();
  });

  it("write() crea directorios intermedios y read() recupera el contenido", async () => {
    const provider = new FileSystemStorageProvider(tempDir());
    await provider.write("nested/dir/file.json", '{"ok":true}');
    expect(await provider.read("nested/dir/file.json")).toBe('{"ok":true}');
    expect(await provider.exists("nested/dir/file.json")).toBe(true);
  });

  it("delete() elimina la clave y es idempotente si ya no existe", async () => {
    const provider = new FileSystemStorageProvider(tempDir());
    await provider.write("a.json", "1");
    await provider.delete("a.json");
    expect(await provider.exists("a.json")).toBe(false);
    await expect(provider.delete("a.json")).resolves.toBeUndefined();
  });

  it("exists() devuelve false para claves inexistentes", async () => {
    const provider = new FileSystemStorageProvider(tempDir());
    expect(await provider.exists("nada.json")).toBe(false);
  });
});
