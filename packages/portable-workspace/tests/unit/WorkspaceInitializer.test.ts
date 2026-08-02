import { describe, it, expect, afterEach } from "vitest";
import { WorkspaceInitializer } from "../../src/WorkspaceInitializer.js";
import { WorkspacePaths } from "../../src/WorkspacePaths.js";
import { WorkspaceErrorCode } from "../../src/errors/WorkspaceErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("WorkspaceInitializer", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("crea toda la estructura y una metadata nueva en un Workspace vacío", async () => {
    const root = tempDir();
    const initializer = new WorkspaceInitializer();
    const result = await initializer.initialize(root);

    expect(result.alreadyInitialized).toBe(false);
    expect(result.createdDirectories).toHaveLength(17);

    const paths = new WorkspacePaths(root);
    const fs = await import("node:fs/promises");
    for (const dir of paths.requiredDirectories()) {
      await expect(fs.stat(dir)).resolves.toBeDefined();
    }
  });

  it("es idempotente: reejecutar sobre un Workspace ya inicializado no crea nada nuevo ni cambia la metadata", async () => {
    const root = tempDir();
    const initializer = new WorkspaceInitializer();
    const first = await initializer.initialize(root);
    const second = await initializer.initialize(root);

    expect(second.alreadyInitialized).toBe(true);
    expect(second.createdDirectories).toHaveLength(0);
    expect(second.metadata).toEqual(first.metadata);
  });

  it("nunca elimina carpetas o ficheros ya existentes en la raíz", async () => {
    const root = tempDir();
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const preexisting = path.join(root, "app", "algo-del-usuario.txt");
    await fs.mkdir(path.join(root, "app"), { recursive: true });
    await fs.writeFile(preexisting, "no tocar", "utf-8");

    const initializer = new WorkspaceInitializer();
    await initializer.initialize(root);

    await expect(fs.readFile(preexisting, "utf-8")).resolves.toBe("no tocar");
  });

  it("crea solo las carpetas que faltan si algunas ya existían", async () => {
    const root = tempDir();
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.join(root, "app"), { recursive: true });
    await fs.mkdir(path.join(root, "logs"), { recursive: true });

    const initializer = new WorkspaceInitializer();
    const result = await initializer.initialize(root);

    expect(result.createdDirectories).toHaveLength(15);
    expect(result.createdDirectories).not.toContain(path.join(root, "app"));
    expect(result.createdDirectories).not.toContain(path.join(root, "logs"));
  });

  it("lanza PWORKSPACE_INITIALIZATION_FAILED si no puede crear una carpeta requerida", async () => {
    const root = tempDir();
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    // "app" como fichero en vez de carpeta impide crear la subcarpeta correspondiente.
    await fs.writeFile(path.join(root, "app"), "no es una carpeta", "utf-8");

    const initializer = new WorkspaceInitializer();
    await expect(initializer.initialize(root)).rejects.toMatchObject({
      code: WorkspaceErrorCode.PWORKSPACE_INITIALIZATION_FAILED,
    });
  });
});
