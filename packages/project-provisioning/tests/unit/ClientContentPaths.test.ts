import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
  resolveClientContentRoot,
  ensureClientKiloSkeleton,
} from "../../src/ClientContentPaths.js";

describe("ClientContentPaths", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-client-content-paths-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  describe("resolveClientContentRoot", () => {
    it("devuelve la ruta real documentada CLIENTES/<clientId>", () => {
      const root = resolveClientContentRoot("/workspace", "mci-finance");
      expect(root).toBe(path.join("/workspace", "CLIENTES", "mci-finance"));
    });

    it("distingue clientes distintos con rutas distintas", () => {
      const a = resolveClientContentRoot("/workspace", "cliente-a");
      const b = resolveClientContentRoot("/workspace", "cliente-b");
      expect(a).not.toBe(b);
    });
  });

  describe("ensureClientKiloSkeleton", () => {
    it("crea .kilo/agents, .kilo/skills y .kilo/rules reales la primera vez", async () => {
      const clientRoot = path.join(tempDir(), "CLIENTES", "mci-finance");
      await ensureClientKiloSkeleton(clientRoot);

      for (const resource of ["agents", "skills", "rules"]) {
        const stat = await fs.stat(path.join(clientRoot, ".kilo", resource));
        expect(stat.isDirectory()).toBe(true);
      }
    });

    it("es idempotente: llamarlo dos veces no falla ni borra nada ya presente", async () => {
      const clientRoot = path.join(tempDir(), "CLIENTES", "mci-finance");
      await ensureClientKiloSkeleton(clientRoot);
      await fs.writeFile(
        path.join(clientRoot, ".kilo", "agents", "coordinador.md"),
        "# Coordinador\n",
        "utf-8"
      );

      await ensureClientKiloSkeleton(clientRoot);

      const raw = await fs.readFile(
        path.join(clientRoot, ".kilo", "agents", "coordinador.md"),
        "utf-8"
      );
      expect(raw).toContain("# Coordinador");
    });
  });
});
