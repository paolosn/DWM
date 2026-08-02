import { describe, it, expect, afterEach } from "vitest";
import { WorkspacePaths } from "../../src/WorkspacePaths.js";
import {
  createInitialWorkspaceMetadata,
  touchWorkspaceMetadata,
  validateWorkspaceMetadataShape,
  readWorkspaceMetadata,
  writeWorkspaceMetadata,
} from "../../src/WorkspaceMetadata.js";
import { WorkspaceErrorCode } from "../../src/errors/WorkspaceErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("createInitialWorkspaceMetadata / touchWorkspaceMetadata", () => {
  it("crea metadata con createdAt=updatedAt y un id no vacío", () => {
    const metadata = createInitialWorkspaceMetadata();
    expect(metadata.id.length).toBeGreaterThan(0);
    expect(metadata.createdAt).toBe(metadata.updatedAt);
  });

  it("touchWorkspaceMetadata actualiza updatedAt preservando el resto", async () => {
    const metadata = createInitialWorkspaceMetadata();
    await new Promise((r) => setTimeout(r, 5));
    const touched = touchWorkspaceMetadata(metadata);
    expect(touched.updatedAt).not.toBe(metadata.updatedAt);
    expect(touched.id).toBe(metadata.id);
    expect(touched.createdAt).toBe(metadata.createdAt);
  });

  it("nunca incluye ninguna ruta absoluta", () => {
    const metadata = createInitialWorkspaceMetadata();
    expect(Object.keys(metadata).sort()).toEqual(["createdAt", "formatVersion", "id", "updatedAt"]);
  });
});

describe("validateWorkspaceMetadataShape", () => {
  it("acepta una metadata válida", () => {
    expect(validateWorkspaceMetadataShape(createInitialWorkspaceMetadata())).toBe(true);
  });

  it("rechaza valores mal formados", () => {
    expect(validateWorkspaceMetadataShape(null)).toBe(false);
    expect(validateWorkspaceMetadataShape({})).toBe(false);
    expect(
      validateWorkspaceMetadataShape({
        id: "",
        formatVersion: "1.0.0",
        createdAt: "x",
        updatedAt: "x",
      })
    ).toBe(false);
    expect(
      validateWorkspaceMetadataShape({
        id: "a",
        formatVersion: "no-semver",
        createdAt: "x",
        updatedAt: "x",
      })
    ).toBe(false);
  });
});

describe("readWorkspaceMetadata / writeWorkspaceMetadata", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("read devuelve undefined si no existe; write/read persisten y recuperan", async () => {
    const paths = new WorkspacePaths(tempDir());
    expect(await readWorkspaceMetadata(paths)).toBeUndefined();

    const metadata = createInitialWorkspaceMetadata();
    await writeWorkspaceMetadata(paths, metadata);
    expect(await readWorkspaceMetadata(paths)).toEqual(metadata);
  });

  it("read lanza PWORKSPACE_INVALID_METADATA ante contenido JSON con forma inválida", async () => {
    const dir = tempDir();
    const paths = new WorkspacePaths(dir);
    const fs = await import("node:fs/promises");
    await fs.mkdir(paths.dwmDir, { recursive: true });
    await fs.writeFile(paths.metadataFile, JSON.stringify({ x: 1 }), "utf-8");
    await expect(readWorkspaceMetadata(paths)).rejects.toMatchObject({
      code: WorkspaceErrorCode.PWORKSPACE_INVALID_METADATA,
    });
  });

  it("read lanza PWORKSPACE_INVALID_METADATA ante JSON corrupto", async () => {
    const dir = tempDir();
    const paths = new WorkspacePaths(dir);
    const fs = await import("node:fs/promises");
    await fs.mkdir(paths.dwmDir, { recursive: true });
    await fs.writeFile(paths.metadataFile, "{ no es json", "utf-8");
    await expect(readWorkspaceMetadata(paths)).rejects.toMatchObject({
      code: WorkspaceErrorCode.PWORKSPACE_INVALID_METADATA,
    });
  });

  it("write lanza PWORKSPACE_PERSISTENCE_FAILED ante un fallo real de escritura", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/no-es-directorio`;
    await fs.writeFile(conflictFile, "contenido");
    const paths = new WorkspacePaths(`${conflictFile}/subdir`);
    await expect(
      writeWorkspaceMetadata(paths, createInitialWorkspaceMetadata())
    ).rejects.toMatchObject({
      code: WorkspaceErrorCode.PWORKSPACE_PERSISTENCE_FAILED,
    });
  });
});
