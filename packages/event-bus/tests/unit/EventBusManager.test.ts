import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { Logger, LogLevel, type LogEntry } from "@dwm/logger";
import { EventBusManager } from "../../src/EventBusManager.js";

describe("EventBusManager — integración con DWMCore real", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-event-bus-manager-"));
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
    const manager = new EventBusManager();

    await core.registerModule(manager);

    const modules = core.listModules();
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({ id: "event-bus-manager", status: "OK" });

    await core.shutdown();
  });

  it("getBus() expone un EventBus operativo", async () => {
    const manager = new EventBusManager();
    let received: unknown;
    manager.getBus().subscribe("x", (envelope) => {
      received = envelope.payload;
    });

    await manager.getBus().publish("x", { ok: true });

    expect(received).toEqual({ ok: true });
  });

  it("integra la configuración normalizada del Core: logLevel por defecto deja debugLogging desactivado", async () => {
    const core = await readyCore();
    const manager = new EventBusManager();
    await core.registerModule(manager);

    // La configuración por defecto del Core es logLevel: "info", así que
    // debugLogging debe quedar desactivado por defecto (sin lanzar ni
    // requerir un Logger para poder publicar con normalidad).
    const bus = manager.getBus();
    bus.subscribe("x", () => {});
    const result = await bus.publish("x", undefined);
    expect(result.matched).toBe(1);

    await core.shutdown();
  });

  it("dispose() limpia todas las suscripciones del bus", async () => {
    const core = await readyCore();
    const manager = new EventBusManager();
    await core.registerModule(manager);
    manager.getBus().subscribe("x", () => {});
    expect(manager.getBus().subscriptionCount()).toBe(1);

    await core.unregisterModule("event-bus-manager");

    expect(manager.getBus().subscriptionCount()).toBe(0);
    await core.shutdown();
  });

  it("acepta un Logger opcional para correlacionar publicaciones", async () => {
    const entries: unknown[] = [];
    const logger = new Logger("test", {
      minLevel: LogLevel.TRACE,
      transports: [{ write: async (e: LogEntry) => void entries.push(e) }],
    });
    const manager = new EventBusManager({ logger });
    manager.getBus().setDebugLogging(true);

    await manager.getBus().publish("x", undefined);

    expect(entries).toHaveLength(1);
  });
});
