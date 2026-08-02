import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PSNScanner } from "../../src/PSNScanner.js";
import { PSNErrorCode } from "../../src/errors/PSNErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeFullPSNTree } from "./support/fixtures.js";

describe("PSNScanner", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("reconoce los doce elementos del catálogo y deja el resto sin clasificar", async () => {
    const root = tempDir();
    await makeFullPSNTree(root);

    const scanner = new PSNScanner();
    const model = await scanner.scan(root);

    const kinds = model.resources.map((r) => r.kind).sort();
    expect(kinds).toEqual(
      [
        "agents",
        "auditorias",
        "clientes",
        "kilo",
        "proyectos",
        "psn-base",
        "psn-knowledge-global",
        "psn-panel",
        "redes-sociales",
        "rules",
        "seguridad",
        "skills",
      ].sort()
    );
    expect(model.unclassified).toEqual(
      expect.arrayContaining(["otra-carpeta-sin-clasificar", "readme.md"])
    );
    expect(model.root).toBe(root);
    expect(typeof model.scannedAt).toBe("number");
  });

  it("agents/skills/rules quedan anidados bajo kilo con relativePath y parentKind correctos", async () => {
    const root = tempDir();
    await makeFullPSNTree(root);

    const scanner = new PSNScanner();
    const model = await scanner.scan(root);

    const agents = model.resources.find((r) => r.kind === "agents");
    expect(agents?.relativePath).toBe(".kilo/agents");
    expect(agents?.parentKind).toBe("kilo");
    expect(agents?.isDirectory).toBe(true);
    expect(agents?.entryCount).toBe(1);

    const psnBase = model.resources.find((r) => r.kind === "psn-base");
    expect(psnBase?.relativePath).toBe("PSN-BASE");
    expect(psnBase?.parentKind).toBeUndefined();
  });

  it("reconoce nombres en minúsculas y variantes equivalentes", async () => {
    const root = tempDir();
    await fs.mkdir(path.join(root, "psn-base"), { recursive: true });
    await fs.mkdir(path.join(root, "proyectos"), { recursive: true });
    await fs.mkdir(path.join(root, "clientes"), { recursive: true });

    const scanner = new PSNScanner();
    const model = await scanner.scan(root);
    expect(model.resources.map((r) => r.kind).sort()).toEqual(
      ["clientes", "proyectos", "psn-base"].sort()
    );
  });

  it("no reconoce agents/skills/rules si no hay carpeta .kilo", async () => {
    const root = tempDir();
    await fs.mkdir(path.join(root, "agents"), { recursive: true });

    const scanner = new PSNScanner();
    const model = await scanner.scan(root);
    expect(model.resources).toEqual([]);
    expect(model.unclassified).toContain("agents");
  });

  it("un recurso que es un fichero (no carpeta) no tiene entryCount", async () => {
    const root = tempDir();
    await fs.writeFile(path.join(root, "PSN-PANEL"), "contenido", "utf-8");

    const scanner = new PSNScanner();
    const model = await scanner.scan(root);
    const panel = model.resources.find((r) => r.kind === "psn-panel");
    expect(panel?.isDirectory).toBe(false);
    expect(panel?.entryCount).toBeUndefined();
  });

  it("lanza PSN_ROOT_NOT_FOUND si la raíz no existe", async () => {
    const scanner = new PSNScanner();
    await expect(scanner.scan(`${tempDir()}/no-existe`)).rejects.toMatchObject({
      code: PSNErrorCode.PSN_ROOT_NOT_FOUND,
    });
  });

  it("lanza PSN_ROOT_NOT_FOUND si la raíz no es una carpeta", async () => {
    const root = tempDir();
    const filePath = path.join(root, "fichero.txt");
    await fs.writeFile(filePath, "x");
    const scanner = new PSNScanner();
    await expect(scanner.scan(filePath)).rejects.toMatchObject({
      code: PSNErrorCode.PSN_ROOT_NOT_FOUND,
    });
  });

  it("un Workspace vacío produce un modelo sin recursos ni entradas sin clasificar", async () => {
    const root = tempDir();
    const scanner = new PSNScanner();
    const model = await scanner.scan(root);
    expect(model.resources).toEqual([]);
    expect(model.unclassified).toEqual([]);
  });
});
