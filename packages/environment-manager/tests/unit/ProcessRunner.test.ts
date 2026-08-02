import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { NodeProcessRunner } from "../../src/ProcessRunner.js";
import { FakeSystemInfoProvider } from "./support/fakes.js";

/**
 * Estos tests ejercitan `NodeProcessRunner` contra procesos reales,
 * pero SIEMPRE contra `process.execPath` (el propio binario de Node
 * que ejecuta los tests) — nunca contra "git", "docker" ni ninguna
 * herramienta externa, para no depender de lo que esté instalado en
 * el equipo.
 */
describe("NodeProcessRunner", () => {
  const systemInfo = new FakeSystemInfoProvider({
    nodePlatform: process.platform,
    env: { PATH: path.dirname(process.execPath) },
  });
  const runner = new NodeProcessRunner(systemInfo);

  describe("run()", () => {
    it("captura stdout y exitCode de un proceso real que termina con éxito", async () => {
      const result = await runner.run(process.execPath, ["--version"], {
        timeoutMs: 5000,
        maxOutputBytes: 1024,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim().startsWith("v")).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.truncated).toBe(false);
    });

    it("captura un exitCode distinto de cero", async () => {
      const result = await runner.run(process.execPath, ["-e", "process.exit(3)"], {
        timeoutMs: 5000,
        maxOutputBytes: 1024,
      });
      expect(result.exitCode).toBe(3);
    });

    it("aplica el timeout y mata el proceso", async () => {
      const result = await runner.run(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], {
        timeoutMs: 200,
        maxOutputBytes: 1024,
      });
      expect(result.timedOut).toBe(true);
    }, 10000);

    it("trunca la salida al superar maxOutputBytes", async () => {
      const result = await runner.run(
        process.execPath,
        ["-e", "process.stdout.write('a'.repeat(5000))"],
        { timeoutMs: 5000, maxOutputBytes: 16 }
      );
      expect(result.truncated).toBe(true);
      expect(result.stdout.length).toBeLessThanOrEqual(16);
    });

    it("rechaza la promesa si el ejecutable no existe", async () => {
      await expect(
        runner.run("/ruta/que/no-existe/en-absoluto-xyz", [], {
          timeoutMs: 1000,
          maxOutputBytes: 1024,
        })
      ).rejects.toThrow();
    });

    it("respeta un AbortSignal ya activado", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        runner.run(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], {
          timeoutMs: 5000,
          maxOutputBytes: 1024,
          signal: controller.signal,
        })
      ).rejects.toThrow();
    });
  });

  describe("which()", () => {
    it("localiza un ejecutable real presente en PATH", async () => {
      const found = await runner.which(path.basename(process.execPath));
      expect(found).toBe(process.execPath);
    });

    it("devuelve undefined para un comando que no existe", async () => {
      expect(await runner.which("comando-que-no-existe-xyz-123")).toBeUndefined();
    });

    it("comprueba directamente una ruta ya cualificada", async () => {
      expect(await runner.which(process.execPath)).toBe(process.execPath);
      expect(await runner.which("/ruta/que/no-existe/en-absoluto-xyz")).toBeUndefined();
    });

    it("devuelve undefined si el signal ya está activado", async () => {
      const controller = new AbortController();
      controller.abort();
      expect(
        await runner.which(path.basename(process.execPath), { signal: controller.signal })
      ).toBeUndefined();
    });
  });
});
