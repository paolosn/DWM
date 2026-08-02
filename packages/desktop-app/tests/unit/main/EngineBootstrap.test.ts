import { describe, expect, it } from "vitest";
import { EngineBootstrap } from "../../../src/main/engine/EngineBootstrap.js";
import { createFakeLogger } from "../support/fakeLogger.js";

describe("EngineBootstrap", () => {
  it("no está en ejecución antes de start()", () => {
    const engine = new EngineBootstrap();
    expect(engine.isRunning()).toBe(false);
  });

  it("start() lo marca en ejecución", () => {
    const engine = new EngineBootstrap({ logger: createFakeLogger() });
    engine.start();
    expect(engine.isRunning()).toBe(true);
  });

  it("execute() antes de start() lanza un error", async () => {
    const engine = new EngineBootstrap();
    await expect(
      engine.execute({ requestId: "r1", operation: "workspace.list", payload: {} })
    ).rejects.toThrow(/no está arrancado/);
  });

  it("execute() delega en ApplicationAPI y devuelve una respuesta normalizada tras start()", async () => {
    const engine = new EngineBootstrap();
    engine.start();
    const response = await engine.execute({
      requestId: "r1",
      operation: "operacion.inexistente",
      payload: {},
    });
    expect(response.success).toBe(false);
  });

  it("dispose() detiene el motor y start() posterior lanza", () => {
    const engine = new EngineBootstrap();
    engine.start();
    engine.dispose();
    expect(engine.isRunning()).toBe(false);
    expect(() => engine.start()).toThrow(/ya ha sido cerrado/);
  });

  it("execute() tras dispose() lanza", async () => {
    const engine = new EngineBootstrap();
    engine.start();
    engine.dispose();
    await expect(
      engine.execute({ requestId: "r1", operation: "workspace.list", payload: {} })
    ).rejects.toThrow(/no está arrancado/);
  });

  it("getVersion() expone la versión pública de la Application API", () => {
    const engine = new EngineBootstrap();
    const version = engine.getVersion();
    expect(version.apiVersion).toBe("1.0.0");
    expect(Array.isArray(version.operations)).toBe(true);
  });
});
