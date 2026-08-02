import { describe, it, expect } from "vitest";
import { EventEmitter } from "../../src/EventEmitter.js";
import { EventPriority } from "../../src/EventPriority.js";
import type { EventEnvelope } from "../../src/EventEnvelope.js";

function makeEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    id: "evt-1",
    type: "user.created",
    payload: {},
    priority: EventPriority.NORMAL,
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("EventEmitter", () => {
  it("despacha a un suscriptor coincidente", async () => {
    const emitter = new EventEmitter();
    const received: string[] = [];
    emitter.subscribe("user.created", (envelope) => {
      received.push(envelope.type);
    });

    const result = await emitter.dispatch(makeEnvelope(), "sync");

    expect(received).toEqual(["user.created"]);
    expect(result).toMatchObject({ matched: 1, delivered: 1, errors: [] });
  });

  it("no despacha a suscriptores cuyo patrón no coincide", async () => {
    const emitter = new EventEmitter();
    const received: string[] = [];
    emitter.subscribe("user.deleted", () => void received.push("x"));

    const result = await emitter.dispatch(makeEnvelope(), "sync");

    expect(received).toEqual([]);
    expect(result.matched).toBe(0);
  });

  it("respeta comodines al despachar", async () => {
    const emitter = new EventEmitter();
    let count = 0;
    emitter.subscribe("user.*", () => {
      count += 1;
    });

    await emitter.dispatch(makeEnvelope({ type: "user.updated" }), "sync");

    expect(count).toBe(1);
  });

  it("despacha en orden de prioridad descendente en modo sync", async () => {
    const emitter = new EventEmitter();
    const order: string[] = [];
    emitter.subscribe("user.created", () => void order.push("baja"), { priority: 0 });
    emitter.subscribe("user.created", () => void order.push("alta"), { priority: 10 });
    emitter.subscribe("user.created", () => void order.push("media"), { priority: 5 });

    await emitter.dispatch(makeEnvelope(), "sync");

    expect(order).toEqual(["alta", "media", "baja"]);
  });

  it("aplica el filtro de suscripción", async () => {
    const emitter = new EventEmitter();
    const received: unknown[] = [];
    emitter.subscribe("user.created", (envelope) => void received.push(envelope.payload), {
      filter: (envelope) => (envelope.payload as { admit?: boolean })?.admit === true,
    });

    await emitter.dispatch(makeEnvelope({ payload: { admit: false } }), "sync");
    await emitter.dispatch(makeEnvelope({ payload: { admit: true } }), "sync");

    expect(received).toEqual([{ admit: true }]);
  });

  it("once() se ejecuta una única vez y se desuscribe automáticamente", async () => {
    const emitter = new EventEmitter();
    let count = 0;
    emitter.once("user.created", () => {
      count += 1;
    });

    await emitter.dispatch(makeEnvelope(), "sync");
    await emitter.dispatch(makeEnvelope(), "sync");

    expect(count).toBe(1);
    expect(emitter.subscriptionCount()).toBe(0);
  });

  it("unsubscribe() detiene las notificaciones futuras", async () => {
    const emitter = new EventEmitter();
    let count = 0;
    const subscription = emitter.subscribe("user.created", () => {
      count += 1;
    });

    await emitter.dispatch(makeEnvelope(), "sync");
    subscription.unsubscribe();
    await emitter.dispatch(makeEnvelope(), "sync");

    expect(count).toBe(1);
    expect(emitter.subscriptionCount()).toBe(0);
  });

  it("modo sync: stopPropagation() impide que los suscriptores restantes se ejecuten", async () => {
    const emitter = new EventEmitter();
    const order: string[] = [];
    emitter.subscribe(
      "user.created",
      (_e, control) => {
        order.push("primero");
        control.stopPropagation();
      },
      { priority: 10 }
    );
    emitter.subscribe("user.created", () => void order.push("segundo"), { priority: 5 });

    const result = await emitter.dispatch(makeEnvelope(), "sync");

    expect(order).toEqual(["primero"]);
    expect(result.propagationStopped).toBe(true);
    expect(result.delivered).toBe(1);
  });

  it("modo async: todos los suscriptores coincidentes se invocan concurrentemente", async () => {
    const emitter = new EventEmitter();
    const order: string[] = [];
    emitter.subscribe("user.created", async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("lento");
    });
    emitter.subscribe("user.created", () => void order.push("rapido"));

    const result = await emitter.dispatch(makeEnvelope(), "async");

    expect(order).toEqual(["rapido", "lento"]);
    expect(result.delivered).toBe(2);
  });

  it("un fallo de un suscriptor se agrega sin detener a los demás (sync)", async () => {
    const emitter = new EventEmitter();
    const order: string[] = [];
    emitter.subscribe(
      "user.created",
      () => {
        throw new Error("fallo suscriptor 1");
      },
      { priority: 10 }
    );
    emitter.subscribe("user.created", () => void order.push("segundo"), { priority: 5 });

    const result = await emitter.dispatch(makeEnvelope(), "sync");

    expect(order).toEqual(["segundo"]);
    expect(result.errors).toHaveLength(1);
    expect(result.delivered).toBe(1);
  });

  it("un fallo de un suscriptor se agrega en modo async sin afectar a los demás", async () => {
    const emitter = new EventEmitter();
    emitter.subscribe("user.created", () => {
      throw new Error("fallo");
    });
    emitter.subscribe("user.created", () => {});

    const result = await emitter.dispatch(makeEnvelope(), "async");

    expect(result.errors).toHaveLength(1);
    expect(result.delivered).toBe(1);
    expect(result.matched).toBe(2);
  });

  it("disposeAll() elimina todas las suscripciones", async () => {
    const emitter = new EventEmitter();
    emitter.subscribe("a", () => {});
    emitter.subscribe("b", () => {});
    expect(emitter.subscriptionCount()).toBe(2);

    emitter.disposeAll();

    expect(emitter.subscriptionCount()).toBe(0);
  });
});
