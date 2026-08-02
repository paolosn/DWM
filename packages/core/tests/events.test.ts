import { describe, it, expect } from "vitest";
import { EventBus } from "../src/events/EventBus.js";
import { DWMCore } from "../src/core/DWMCore.js";
import { ErrorCode } from "../src/errors/ErrorCodes.js";
import { MemoryStorageProvider, makeModule } from "./support/doubles.js";

describe("EventBus", () => {
  it("[27] aísla errores entre listeners: un listener roto no impide a los demás ejecutarse", () => {
    const bus = new EventBus();
    const calls: string[] = [];

    bus.on("domain:event", () => {
      calls.push("first");
      throw new Error("fallo deliberado del primer listener");
    });
    bus.on("domain:event", () => {
      calls.push("second");
    });

    expect(() => bus.emit("domain:event", { any: true })).not.toThrow();
    expect(calls).toEqual(["first", "second"]);
  });

  it("[28] emite core:listener-error cuando un suscriptor lanza una excepción", () => {
    const bus = new EventBus();
    const captured: Array<{ eventType: string; error: unknown }> = [];

    bus.on("core:listener-error", (payload) => captured.push(payload));
    bus.on("domain:event", () => {
      throw new Error("boom");
    });

    bus.emit("domain:event", {});

    expect(captured).toHaveLength(1);
    expect(captured[0]!.eventType).toBe("domain:event");
    expect(captured[0]!.error).toBeInstanceOf(Error);
  });

  it("[29] once() se ejecuta una única vez", () => {
    const bus = new EventBus();
    let calls = 0;
    bus.once("domain:once", () => {
      calls += 1;
    });

    bus.emit("domain:once", {});
    bus.emit("domain:once", {});
    bus.emit("domain:once", {});

    expect(calls).toBe(1);
  });

  it("[30] la función de cancelación devuelta por on() detiene las notificaciones", () => {
    const bus = new EventBus();
    let calls = 0;
    const unsubscribe = bus.on("domain:cancel", () => {
      calls += 1;
    });

    bus.emit("domain:cancel", {});
    unsubscribe();
    bus.emit("domain:cancel", {});

    expect(calls).toBe(1);
  });

  it("listenerCount refleja el número de suscriptores activos", () => {
    const bus = new EventBus();
    expect(bus.listenerCount("domain:count")).toBe(0);
    const off1 = bus.on("domain:count", () => {});
    bus.on("domain:count", () => {});
    expect(bus.listenerCount("domain:count")).toBe(2);
    off1();
    expect(bus.listenerCount("domain:count")).toBe(1);
  });

  it("createScopedEmitter permite emitir eventos de dominio pero rechaza el namespace core:*", () => {
    const bus = new EventBus();
    const scoped = bus.createScopedEmitter();

    let domainReceived: unknown = null;
    scoped.on("domain:custom", (payload) => {
      domainReceived = payload;
    });
    scoped.emit("domain:custom", { ok: true });
    expect(domainReceived).toEqual({ ok: true });

    expect(() => scoped.emit("core:ready", {})).toThrow(
      expect.objectContaining({ code: ErrorCode.RESERVED_EVENT_NAMESPACE })
    );
  });
});

describe("DWMCore — coherencia del namespace core:*", () => {
  it("un módulo recibe un ScopedEventBus que no puede falsificar eventos core:*", async () => {
    const core = new DWMCore();
    await core.initialize({ storage: new MemoryStorageProvider() });

    let attemptedSpoof: unknown = null;
    await core.registerModule(
      makeModule({
        id: "mod.event-safe",
        init: async (context) => {
          try {
            context.eventBus.emit("core:ready", {});
          } catch (err) {
            attemptedSpoof = err;
          }
        },
      })
    );

    expect(attemptedSpoof).toMatchObject({ code: ErrorCode.RESERVED_EVENT_NAMESPACE });
  });
});
