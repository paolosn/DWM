import { describe, it, expect, afterEach } from "vitest";
import { WorkspaceScanner } from "../../src/WorkspaceScanner.js";
import { WorkspaceErrorCode } from "../../src/errors/WorkspaceErrorCode.js";
import { makeTempDir, writeFile } from "./support/tempDir.js";

describe("WorkspaceScanner", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  it("escanea recursivamente todos los ficheros", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    writeFile(dir, "a.txt", "1");
    writeFile(dir, "sub/b.txt", "22");
    writeFile(dir, "sub/deep/c.txt", "333");

    const scanner = new WorkspaceScanner();
    const index = await scanner.scan(dir, []);

    expect(index.files.map((f) => f.relativePath).sort()).toEqual([
      "a.txt",
      "sub/b.txt",
      "sub/deep/c.txt",
    ]);
    expect(typeof index.signature).toBe("string");
    expect(index.signature.length).toBeGreaterThan(0);
  });

  it("excluye ficheros y directorios que coinciden con los patrones", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    writeFile(dir, "src/index.ts", "code");
    writeFile(dir, "node_modules/pkg/index.js", "dep");
    writeFile(dir, "app.log", "log");

    const scanner = new WorkspaceScanner();
    const index = await scanner.scan(dir, ["node_modules/**", "*.log"]);

    expect(index.files.map((f) => f.relativePath)).toEqual(["src/index.ts"]);
  });

  it("la firma cambia si el contenido de un fichero cambia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    writeFile(dir, "a.txt", "contenido inicial");

    const scanner = new WorkspaceScanner();
    const first = await scanner.scan(dir, []);

    await new Promise((r) => setTimeout(r, 5));
    writeFile(dir, "a.txt", "contenido modificado, más largo");
    const second = await scanner.scan(dir, []);

    expect(second.signature).not.toBe(first.signature);
  });

  it("la firma es estable si nada cambia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    writeFile(dir, "a.txt", "x");
    writeFile(dir, "b.txt", "y");

    const scanner = new WorkspaceScanner();
    const first = await scanner.scan(dir, []);
    const second = await scanner.scan(dir, []);

    expect(second.signature).toBe(first.signature);
  });

  it("lanza WORKSPACE_SCAN_FAILED si la ruta no existe", async () => {
    const scanner = new WorkspaceScanner();
    await expect(scanner.scan("/ruta/que/no/existe/jamas", [])).rejects.toMatchObject({
      code: WorkspaceErrorCode.WORKSPACE_SCAN_FAILED,
    });
  });
});
