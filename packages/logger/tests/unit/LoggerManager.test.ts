import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { LoggerManager } from "../../src/LoggerManager.js";
import { LogLevel } from "../../src/LogLevel.js";
import { MemoryTransport } from "./support/MemoryTransport.js";

describe("LoggerManager — integración con DWMCore real", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-logger-manager-"));
    dirs.push(dir);
    return dir;
  }

  async function readyCore(): Promise<DWMCore> {
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(tempDir()) });
    return core;
  }

  it("se registra como módulo conforme a IModule y reporta estado OK", async () => {
    const core = await readyCore();
    const transport = new MemoryTransport();
    const manager = new LoggerManager({ minLevel: LogLevel.TRACE, transports: [transport] });

    await core.registerModule(manager);

    const modules = core.listModules();
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({ id: "logger-manager", status: "OK" });

    await core.shutdown();
  });

  it("captura core:error automáticamente a través del logger 'core'", async () => {
    const core = await readyCore();
    const transport = new MemoryTransport();
    const manager = new LoggerManager({ minLevel: LogLevel.TRACE, transports: [transport] });

    // Se registra primero el módulo problemático y después el LoggerManager,
    // para que este último se dé de baja (y se desuscriba) después de que
    // el Core emita core:error al fallar el dispose() del primero.
    await core.registerModule({
      id: "con-dispose-roto",
      version: "1.0.0",
      contractVersion: "1.0.0",
      init: async () => {},
      dispose: async () => {
        throw new Error("dispose roto");
      },
    });
    await core.registerModule(manager);

    await core.shutdown();

    const captured = transport.entries.filter(
      (e) => e.loggerName === "core" && e.level === LogLevel.ERROR
    );
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]!.metadata).toMatchObject({ code: "CORE_MODULE_DISPOSE_FAILED" });
  });

  it("dispose() libera todos los transportes con dispose()", async () => {
    const transport = new MemoryTransport();
    const manager = new LoggerManager({ minLevel: LogLevel.TRACE, transports: [transport] });
    const core = await readyCore();
    await core.registerModule(manager);

    await core.unregisterModule("logger-manager");

    expect(transport.disposed).toBe(true);
    await core.shutdown();
  });

  it("dispose() agrega y propaga un fallo de dispose() de un transporte como LOGGER_TRANSPORT_DISPOSE_FAILED", async () => {
    const failing = new MemoryTransport({ failDispose: true });
    const manager = new LoggerManager({ minLevel: LogLevel.TRACE, transports: [failing] });
    const core = await readyCore();
    await core.registerModule(manager);

    await expect(core.unregisterModule("logger-manager")).rejects.toMatchObject({
      code: "CORE_MODULE_DISPOSE_FAILED",
    });

    await core.shutdown();
  });

  it("getLogger() cachea por nombre: la misma instancia se reutiliza", async () => {
    const manager = new LoggerManager({
      minLevel: LogLevel.TRACE,
      transports: [new MemoryTransport()],
    });
    const a = manager.getLogger("x");
    const b = manager.getLogger("x");
    expect(a).toBe(b);
  });
});
