import { describe, it, expect, afterEach } from "vitest";
import { WorkspaceLoader } from "../../src/WorkspaceLoader.js";
import { createInitialMetadata } from "../../src/WorkspaceMetadata.js";
import { defaultWorkspaceConfiguration } from "../../src/WorkspaceConfiguration.js";
import { WorkspaceErrorCode } from "../../src/errors/WorkspaceErrorCode.js";
import { makeTempDir, writeFile } from "./support/tempDir.js";

describe("WorkspaceLoader", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  it("assertValidPath acepta un directorio existente", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    await expect(new WorkspaceLoader().assertValidPath(dir)).resolves.toBeUndefined();
  });

  it("assertValidPath rechaza una ruta inexistente", async () => {
    await expect(new WorkspaceLoader().assertValidPath("/no/existe/jamas")).rejects.toMatchObject({
      code: WorkspaceErrorCode.WORKSPACE_INVALID_PATH,
    });
  });

  it("assertValidPath rechaza una ruta que no es un directorio", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    writeFile(dir, "archivo.txt", "x");
    await expect(new WorkspaceLoader().assertValidPath(`${dir}/archivo.txt`)).rejects.toMatchObject(
      {
        code: WorkspaceErrorCode.WORKSPACE_INVALID_PATH,
      }
    );
  });

  it("isWorkspace() es false antes de guardar y true después", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const loader = new WorkspaceLoader();

    expect(await loader.isWorkspace(dir)).toBe(false);

    await loader.saveMetadata(dir, createInitialMetadata("id1", "Nombre", dir));
    expect(await loader.isWorkspace(dir)).toBe(true);
  });

  it("guarda y recupera metadatos y configuración", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const loader = new WorkspaceLoader();
    const metadata = createInitialMetadata("id1", "Mi Workspace", dir);
    const configuration = defaultWorkspaceConfiguration();

    await loader.saveMetadata(dir, metadata);
    await loader.saveConfiguration(dir, configuration);

    const loadedMetadata = await loader.loadMetadata(dir);
    const loadedConfiguration = await loader.loadConfiguration(dir);

    expect(loadedMetadata).toEqual(metadata);
    expect(loadedConfiguration).toEqual(configuration);
  });

  it("loadMetadata lanza WORKSPACE_LOAD_FAILED si no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    await expect(new WorkspaceLoader().loadMetadata(dir)).rejects.toMatchObject({
      code: WorkspaceErrorCode.WORKSPACE_LOAD_FAILED,
    });
  });

  it("loadConfiguration lanza WORKSPACE_LOAD_FAILED si el contenido es inválido", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    writeFile(dir, ".dwm-workspace/configuration.json", "{ esto no es json válido");
    await expect(new WorkspaceLoader().loadConfiguration(dir)).rejects.toMatchObject({
      code: WorkspaceErrorCode.WORKSPACE_LOAD_FAILED,
    });
  });
});
