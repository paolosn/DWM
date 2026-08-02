import { describe, it, expect, afterEach } from "vitest";
import * as path from "node:path";
import { WorkspaceLocator } from "../../src/WorkspaceLocator.js";
import {
  createInitialWorkspaceMetadata,
  writeWorkspaceMetadata,
} from "../../src/WorkspaceMetadata.js";
import { WorkspacePaths } from "../../src/WorkspacePaths.js";
import { makeTempDir } from "./support/tempDir.js";

describe("WorkspaceLocator", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("locate() devuelve undefined si no hay ninguna raíz de DWM en la ascendencia", async () => {
    const locator = new WorkspaceLocator();
    expect(await locator.locate(tempDir())).toBeUndefined();
  });

  it("locate() encuentra la raíz cuando el directorio de partida ES la raíz", async () => {
    const root = tempDir();
    await writeWorkspaceMetadata(new WorkspacePaths(root), createInitialWorkspaceMetadata());
    const locator = new WorkspaceLocator();
    expect(await locator.locate(root)).toBe(path.resolve(root));
  });

  it("locate() encuentra la raíz buscando hacia arriba desde una subcarpeta profunda", async () => {
    const root = tempDir();
    await writeWorkspaceMetadata(new WorkspacePaths(root), createInitialWorkspaceMetadata());
    const fs = await import("node:fs/promises");
    const deep = path.join(root, "workspace", "SISTEMA-DE-TRABAJO", "proyecto", "src");
    await fs.mkdir(deep, { recursive: true });

    const locator = new WorkspaceLocator();
    expect(await locator.locate(deep)).toBe(path.resolve(root));
  });

  it("looksLikeDwmRoot() distingue una raíz válida de una carpeta cualquiera", async () => {
    const locator = new WorkspaceLocator();
    const plain = tempDir();
    expect(await locator.looksLikeDwmRoot(plain)).toBe(false);

    const root = tempDir();
    await writeWorkspaceMetadata(new WorkspacePaths(root), createInitialWorkspaceMetadata());
    expect(await locator.looksLikeDwmRoot(root)).toBe(true);
  });

  describe("detectMove", () => {
    it("no reporta desplazamiento si la raíz anterior sigue siendo válida", async () => {
      const root = tempDir();
      const metadata = createInitialWorkspaceMetadata();
      await writeWorkspaceMetadata(new WorkspacePaths(root), metadata);

      const locator = new WorkspaceLocator();
      const result = await locator.detectMove(root, metadata.id);
      expect(result.moved).toBe(false);
    });

    it("detecta un cambio de unidad/carpeta cuando la nueva raíz comparte el mismo id de metadata", async () => {
      const oldRoot = tempDir();
      const newRoot = tempDir();
      const metadata = createInitialWorkspaceMetadata();
      await writeWorkspaceMetadata(new WorkspacePaths(newRoot), metadata);

      const locator = new WorkspaceLocator();
      const result = await locator.detectMove(oldRoot, metadata.id, newRoot);

      expect(result.moved).toBe(true);
      expect(result.newRoot).toBe(path.resolve(newRoot));
    });

    it("no reporta desplazamiento si no se encuentra ninguna raíz alternativa", async () => {
      const oldRoot = tempDir();
      const emptyStart = tempDir();
      const locator = new WorkspaceLocator();
      const result = await locator.detectMove(oldRoot, "id-inexistente", emptyStart);
      expect(result.moved).toBe(false);
    });

    it("no reporta desplazamiento si la nueva raíz localizada tiene un id de metadata distinto", async () => {
      const oldRoot = tempDir();
      const newRoot = tempDir();
      await writeWorkspaceMetadata(new WorkspacePaths(newRoot), createInitialWorkspaceMetadata());

      const locator = new WorkspaceLocator();
      const result = await locator.detectMove(oldRoot, "id-distinto", newRoot);
      expect(result.moved).toBe(false);
    });
  });
});
