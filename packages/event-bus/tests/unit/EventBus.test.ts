import { describe, it, expect } from "vitest";
import { EventBus } from "../../src/EventBus.js";
import { EventPriority } from "../../src/EventPriority.js";
import { EventBusErrorCode } from "../../src/errors/EventBusErrorCode.js";
import { Logger, LogLevel, type LogEntry } from "@dwm/logger";

class MemoryTransport {
  entries: LogEntry[] = [];
  async write(entry: LogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

describe("EventBus", () => {
  it("publish()/subscribe() entregan el payload tipado al suscriptor", async () => {
    interface Events extends Record<string, unknown> {
      "user.created": { id: string };
    }
    const bus = new EventBus<Events>();
    let receivedId: string | undefined;
    bus.subscribe("user.created", (envelope) => {
      receivedId = envelope.payload.id;
    });

    const result = await bus.publish("user.created", { id: "u1" });

    expect(receivedId).toBe("u1");
    expect(result).toMatchObject({ type: "user.created", matched: 1, delivered: 1 });
    expect(typeof result.eventId).toBe("string");
  });

  it("once() se ejecuta una única vez", async () => {
    const bus = new EventBus();
    let count = 0;
    bus.once("x", () => {
      count += 1;
    });

    await bus.publish("x", undefined);
    await bus.publish("x", undefined);

    expect(count).toBe(1);
  });

  it("unsubscribe() detiene las notificaciones", async () => {
    const bus = new EventBus();
    let count = 0;
    const subscription = bus.subscribe("x", () => {
      count += 1;
    });

    await bus.publish("x", undefined);
    bus.unsubscribe(subscription);
    await bus.publish("x", undefined);

    expect(count).toBe(1);
  });

  it("soporta eventos con comodines", async () => {
    const bus = new EventBus();
    const received: string[] = [];
    bus.subscribe("user.*", (envelope) => void received.push(envelope.type));

    await bus.publish("user.created", undefined);
    await bus.publish("user.deleted", undefined);
    await bus.publish("order.created", undefined);

    expect(received).toEqual(["user.created", "user.deleted"]);
  });

  it("asigna EventPriority.NORMAL por defecto y respeta la prioridad indicada", async () => {
    const bus = new EventBus();
    let captured: EventPriority | undefined;
    bus.subscribe("x", (envelope) => {
      captured = envelope.priority;
    });

    await bus.publish("x", undefined);
    expect(captured).toBe(EventPriority.NORMAL);

    await bus.publish("x", undefined, { priority: EventPriority.CRITICAL });
    expect(captured).toBe(EventPriority.CRITICAL);
  });

  it("propaga correlationId, source y metadata al envelope", async () => {
    const bus = new EventBus();
    let captured: unknown;
    bus.subscribe("x", (envelope) => {
      captured = envelope;
    });

    await bus.publish("x", undefined, {
      correlationId: "corr-1",
      source: "test-suite",
      metadata: { a: 1 },
    });

    expect(captured).toMatchObject({
      correlationId: "corr-1",
      source: "test-suite",
      metadata: { a: 1 },
    });
  });

  it("un middleware que llama a next() permite la propagación", async () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.use(async (_envelope, next) => {
      order.push("middleware");
      await next();
    });
    bus.subscribe("x", () => void order.push("suscriptor"));

    const result = await bus.publish("x", undefined);

    expect(order).toEqual(["middleware", "suscriptor"]);
    expect(result.cancelledByMiddleware).toBe(false);
  });

  it("un middleware que no llama a next() cancela la publicación", async () => {
    const bus = new EventBus();
    let called = false;
    bus.use(async () => {
      /* nunca llama a next() */
    });
    bus.subscribe("x", () => {
      called = true;
    });

    const result = await bus.publish("x", undefined);

    expect(called).toBe(false);
    expect(result.cancelledByMiddleware).toBe(true);
    expect(result.delivered).toBe(0);
  });

  it("varios middlewares se ejecutan en orden de registro", async () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.use(async (_e, next) => {
      order.push("mw1");
      await next();
    });
    bus.use(async (_e, next) => {
      order.push("mw2");
      await next();
    });
    bus.subscribe("x", () => void order.push("handler"));

    await bus.publish("x", undefined);

    expect(order).toEqual(["mw1", "mw2", "handler"]);
  });

  it("un middleware que lanza se envuelve como EVENTBUS_MIDDLEWARE_FAILED", async () => {
    const bus = new EventBus();
    bus.use(async () => {
      throw new Error("fallo de middleware");
    });

    await expect(bus.publish("x", undefined)).rejects.toMatchObject({
      code: EventBusErrorCode.EVENTBUS_MIDDLEWARE_FAILED,
    });
  });

  it("propagationStopped en modo sync detiene a los suscriptores de menor prioridad", async () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.subscribe(
      "x",
      (_e, control) => {
        order.push("alta");
        control.stopPropagation();
      },
      { priority: 10 }
    );
    bus.subscribe("x", () => void order.push("baja"), { priority: 1 });

    const result = await bus.publish("x", undefined, { mode: "sync" });

    expect(order).toEqual(["alta"]);
    expect(result.propagationStopped).toBe(true);
  });

  it("modo async invoca a todos los suscriptores coincidentes", async () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.subscribe("x", () => void order.push("a"));
    bus.subscribe("x", () => void order.push("b"));

    const result = await bus.publish("x", undefined, { mode: "async" });

    expect(order.sort()).toEqual(["a", "b"]);
    expect(result.delivered).toBe(2);
  });

  it("los fallos de suscriptor se recogen en el resultado, sin lanzar", async () => {
    const bus = new EventBus();
    bus.subscribe("x", () => {
      throw new Error("boom");
    });

    const result = await bus.publish("x", undefined);

    expect(result.errors).toHaveLength(1);
  });

  it("subscriptionCount() y disposeAll() reflejan el estado interno", async () => {
    const bus = new EventBus();
    bus.subscribe("a", () => {});
    bus.subscribe("b", () => {});
    expect(bus.subscriptionCount()).toBe(2);

    bus.disposeAll();

    expect(bus.subscriptionCount()).toBe(0);
  });

  it("correlaciona la publicación con un Logger cuando debugLogging está activo", async () => {
    const transport = new MemoryTransport();
    const logger = new Logger("test", { minLevel: LogLevel.TRACE, transports: [transport] });
    const bus = new EventBus({ logger, debugLogging: true });

    await bus.publish("x", undefined, { correlationId: "corr-xyz" });

    const debugEntries = transport.entries.filter((e) => e.level === LogLevel.DEBUG);
    expect(debugEntries).toHaveLength(1);
    expect(debugEntries[0]!.correlationId).toBe("corr-xyz");
  });

  it("no registra la publicación si debugLogging está desactivado, pero sí los fallos de suscriptor", async () => {
    const transport = new MemoryTransport();
    const logger = new Logger("test", { minLevel: LogLevel.TRACE, transports: [transport] });
    const bus = new EventBus({ logger, debugLogging: false });
    bus.subscribe("x", () => {
      throw new Error("boom");
    });

    await bus.publish("x", undefined, { correlationId: "corr-err" });

    const debugEntries = transport.entries.filter((e) => e.level === LogLevel.DEBUG);
    const errorEntries = transport.entries.filter((e) => e.level === LogLevel.ERROR);
    expect(debugEntries).toHaveLength(0);
    expect(errorEntries).toHaveLength(1);
    expect(errorEntries[0]!.correlationId).toBe("corr-err");
  });

  it("setDebugLogging() activa/desactiva el registro de publicaciones dinámicamente", async () => {
    const transport = new MemoryTransport();
    const logger = new Logger("test", { minLevel: LogLevel.TRACE, transports: [transport] });
    const bus = new EventBus({ logger, debugLogging: false });

    await bus.publish("x", undefined);
    expect(transport.entries).toHaveLength(0);

    bus.setDebugLogging(true);
    await bus.publish("x", undefined);
    expect(transport.entries).toHaveLength(1);
  });
});
