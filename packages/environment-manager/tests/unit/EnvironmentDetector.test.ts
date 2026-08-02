import { describe, it, expect } from "vitest";
import { EnvironmentDetector } from "../../src/EnvironmentDetector.js";
import { ToolRegistry } from "../../src/ToolRegistry.js";
import { EnvironmentErrorCode } from "../../src/errors/EnvironmentErrorCode.js";
import { FakeProcessRunner, FakeSystemInfoProvider } from "./support/fakes.js";
import type { ToolDetectorDefinition } from "../../src/ToolDetector.js";

function makeContext(processRunner: FakeProcessRunner, signal?: AbortSignal) {
  return {
    processRunner,
    systemInfo: new FakeSystemInfoProvider(),
    platform: "linux" as const,
    defaultTimeoutMs: 1000,
    defaultMaxOutputBytes: 4096,
    ...(signal ? { signal } : {}),
  };
}

describe("EnvironmentDetector", () => {
  const detector = new EnvironmentDetector();

  it("detecta todas las herramientas registradas, aislando fallos individuales", async () => {
    const registry = new ToolRegistry();
    registry.register({ id: "ok", name: "OK", category: "cli", candidates: [{ command: "ok" }] });
    registry.register({
      id: "roto",
      name: "Roto",
      category: "cli",
      candidates: [{ command: "roto" }],
    });

    const runner = new FakeProcessRunner();
    runner.setExecutable("ok", "/usr/bin/ok");
    runner.setRunResult("/usr/bin/ok", { stdout: "1.0.0" });
    runner.setExecutable("roto", "/usr/bin/roto");
    runner.setRunResult("/usr/bin/roto", { throws: new Error("fallo inesperado") });

    const results = await detector.detectAll(registry, makeContext(runner));
    expect(results).toHaveLength(2);
    const ok = results.find((r) => r.id === "ok");
    const roto = results.find((r) => r.id === "roto");
    expect(ok?.status).toBe("available");
    expect(roto?.status).toBe("invalid");
  });

  it("relanza como ENVIRONMENT_INSPECTION_CANCELLED si el signal se activa antes de empezar", async () => {
    const registry = new ToolRegistry();
    registry.register({ id: "ok", name: "OK", category: "cli", candidates: [{ command: "ok" }] });
    const controller = new AbortController();
    controller.abort();

    const runner = new FakeProcessRunner();
    await expect(
      detector.detectAll(registry, makeContext(runner, controller.signal))
    ).rejects.toMatchObject({
      code: EnvironmentErrorCode.ENVIRONMENT_INSPECTION_CANCELLED,
    });
  });

  it("relanza como ENVIRONMENT_INSPECTION_CANCELLED si la cancelación ocurre durante la detección", async () => {
    const registry = new ToolRegistry();
    registry.register({
      id: "lento",
      name: "Lento",
      category: "cli",
      candidates: [{ command: "lento" }],
    });

    const runner = new FakeProcessRunner();
    runner.setExecutable("lento", "/usr/bin/lento");
    runner.setRunResult("/usr/bin/lento", { delayMs: 200 });

    const controller = new AbortController();
    const promise = detector.detectAll(registry, makeContext(runner, controller.signal));
    setTimeout(() => controller.abort(), 20);

    await expect(promise).rejects.toMatchObject({
      code: EnvironmentErrorCode.ENVIRONMENT_INSPECTION_CANCELLED,
    });
  });

  it("devuelve [] si no hay detectores registrados", async () => {
    const registry = new ToolRegistry();
    const runner = new FakeProcessRunner();
    expect(await detector.detectAll(registry, makeContext(runner))).toEqual([]);
  });

  it("no lanza cuando un detector produce un ToolResult normal, aunque otros fallen", async () => {
    const registry = new ToolRegistry();
    const failing: ToolDetectorDefinition = {
      id: "sin-candidatos-utiles",
      name: "X",
      category: "cli",
      candidates: [{ command: "no-instalado" }],
    };
    registry.register(failing);
    const runner = new FakeProcessRunner();
    const results = await detector.detectAll(registry, makeContext(runner));
    expect(results[0]?.status).toBe("missing");
  });
});
