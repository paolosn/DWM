import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Scheduler } from "../../src/Scheduler.js";
import { SchedulerErrorCode } from "../../src/errors/SchedulerErrorCode.js";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Scheduler — programación básica", () => {
  it("ejecuta una tarea inmediata (sin delay) en el siguiente tick", async () => {
    const scheduler = new Scheduler();
    let executed = false;
    scheduler.schedule(() => {
      executed = true;
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(executed).toBe(true);
  });

  it("respeta delayMs antes de la primera ejecución", async () => {
    const scheduler = new Scheduler();
    let executed = false;
    scheduler.schedule(
      () => {
        executed = true;
      },
      { delayMs: 1000 }
    );

    await vi.advanceTimersByTimeAsync(500);
    expect(executed).toBe(false);

    await vi.advanceTimersByTimeAsync(500);
    expect(executed).toBe(true);
  });

  it("ejecuta de forma periódica con intervalMs", async () => {
    const scheduler = new Scheduler();
    let count = 0;
    scheduler.schedule(() => void (count += 1), { intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(count).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(count).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(count).toBe(3);
  });

  it("ejecuta según una expresión cron", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const scheduler = new Scheduler();
    let count = 0;
    scheduler.schedule(() => void (count += 1), { cronExpression: "*/1 * * * *" });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(count).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(count).toBe(2);
  });

  it("once: true ejecuta una única vez aunque declare intervalMs", async () => {
    const scheduler = new Scheduler();
    let count = 0;
    scheduler.schedule(() => void (count += 1), { intervalMs: 1000, once: true });

    await vi.advanceTimersByTimeAsync(1000);
    expect(count).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(count).toBe(1);
  });

  it("rechaza un id de tarea duplicado", () => {
    const scheduler = new Scheduler();
    scheduler.schedule(() => {}, { id: "dup" });
    expect(() => scheduler.schedule(() => {}, { id: "dup" })).toThrow(
      expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_DUPLICATE_TASK_ID })
    );
  });
});

describe("Scheduler — cancelación, pausa y reanudación", () => {
  it("cancel() impide ejecuciones futuras", async () => {
    const scheduler = new Scheduler();
    let count = 0;
    const handle = scheduler.schedule(() => void (count += 1), { intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(count).toBe(1);

    handle.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(count).toBe(1);
    expect(handle.snapshot().status).toBe("cancelled");
  });

  it("pause() detiene las ejecuciones y resume() las reanuda", async () => {
    const scheduler = new Scheduler();
    let count = 0;
    const handle = scheduler.schedule(() => void (count += 1), { intervalMs: 1000 });

    handle.pause();
    expect(handle.snapshot().status).toBe("paused");
    await vi.advanceTimersByTimeAsync(3000);
    expect(count).toBe(0);

    handle.resume();
    await vi.advanceTimersByTimeAsync(1000);
    expect(count).toBe(1);
  });

  it("runNow() ejecuta la tarea de inmediato, fuera de su programación", async () => {
    const scheduler = new Scheduler();
    let count = 0;
    const handle = scheduler.schedule(() => void (count += 1), { delayMs: 60_000 });

    await handle.runNow();

    expect(count).toBe(1);
  });

  it("runNow() sobre una tarea cancelada lanza SCHEDULER_TASK_NOT_FOUND", async () => {
    const scheduler = new Scheduler();
    const handle = scheduler.schedule(() => {});
    handle.cancel();

    await expect(handle.runNow()).rejects.toMatchObject({
      code: SchedulerErrorCode.SCHEDULER_TASK_NOT_FOUND,
    });
  });
});

describe("Scheduler — prioridades y concurrencia", () => {
  it("despacha en orden de prioridad cuando varias tareas están debidas a la vez", async () => {
    const scheduler = new Scheduler({ configuration: { maxConcurrency: 1 } });
    const order: string[] = [];
    scheduler.schedule(() => void order.push("baja"), { delayMs: 100, priority: 0 });
    scheduler.schedule(() => void order.push("alta"), { delayMs: 100, priority: 10 });

    await vi.advanceTimersByTimeAsync(100);

    expect(order).toEqual(["alta", "baja"]);
  });

  it("respeta la concurrencia máxima configurada", async () => {
    const scheduler = new Scheduler({ configuration: { maxConcurrency: 2 } });
    let concurrentPeak = 0;
    let current = 0;
    const release: Array<() => void> = [];

    for (let i = 0; i < 3; i += 1) {
      scheduler.schedule(
        () =>
          new Promise<void>((resolve) => {
            current += 1;
            concurrentPeak = Math.max(concurrentPeak, current);
            release.push(() => {
              current -= 1;
              resolve();
            });
          }),
        { delayMs: 100 }
      );
    }

    await vi.advanceTimersByTimeAsync(100);
    expect(concurrentPeak).toBe(2);
    expect(scheduler.statistics().runningCount).toBe(2);
    expect(scheduler.statistics().queuedCount).toBe(1);

    release[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.statistics().runningCount).toBe(2);

    release[1]!();
    release[2]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.statistics().runningCount).toBe(0);
  });
});

describe("Scheduler — timeout, retry y backoff", () => {
  it("una tarea que supera su timeout se trata como fallo", async () => {
    const scheduler = new Scheduler();
    const handle = scheduler.schedule(() => new Promise<void>(() => {}), { timeoutMs: 500 });

    await vi.advanceTimersByTimeAsync(0); // dispara la ejecución
    await vi.advanceTimersByTimeAsync(500); // vence el timeout

    expect(handle.snapshot().status).toBe("failed");
    expect(scheduler.statistics().totalFailed).toBe(1);
  });

  it("reintenta con backoff exponencial hasta maxAttempts", async () => {
    const scheduler = new Scheduler();
    let attempts = 0;
    const handle = scheduler.schedule(
      () => {
        attempts += 1;
        throw new Error("fallo simulado");
      },
      { retry: { maxAttempts: 3, backoff: { baseDelayMs: 100, factor: 2 } } }
    );

    await vi.advanceTimersByTimeAsync(0); // intento 1
    expect(attempts).toBe(1);
    expect(handle.snapshot().status).toBe("scheduled");

    await vi.advanceTimersByTimeAsync(100); // intento 2 (backoff 100ms)
    expect(attempts).toBe(2);

    await vi.advanceTimersByTimeAsync(200); // intento 3 (backoff 200ms)
    expect(attempts).toBe(3);
    expect(handle.snapshot().status).toBe("failed");
    expect(scheduler.statistics().totalRetries).toBe(2);
    expect(scheduler.statistics().totalFailed).toBe(1);
  });

  it("una tarea periódica que falla todos sus reintentos se reprograma igualmente", async () => {
    const scheduler = new Scheduler();
    let attempts = 0;
    const handle = scheduler.schedule(
      () => {
        attempts += 1;
        throw new Error("fallo simulado");
      },
      { intervalMs: 1000, retry: { maxAttempts: 1, backoff: { baseDelayMs: 10 } } }
    );

    await vi.advanceTimersByTimeAsync(1000);
    expect(attempts).toBe(1);
    expect(handle.snapshot().status).toBe("scheduled");

    await vi.advanceTimersByTimeAsync(1000);
    expect(attempts).toBe(2);
  });

  it("una tarea que se recupera tras un fallo reinicia el contador de intentos", async () => {
    const scheduler = new Scheduler();
    let attempts = 0;
    scheduler.schedule(
      () => {
        attempts += 1;
        if (attempts === 1) throw new Error("primer intento falla");
      },
      { retry: { maxAttempts: 3, backoff: { baseDelayMs: 50 } } }
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(50);

    expect(attempts).toBe(2);
  });
});

describe("Scheduler — eventos y estadísticas", () => {
  it("notifica start/complete a través de un EventBus inyectado", async () => {
    const published: Array<{ type: string; payload: unknown }> = [];
    const fakeBus = {
      publish: async (type: string, payload: unknown) => {
        published.push({ type, payload });
        return {
          eventId: "e",
          type,
          matched: 0,
          delivered: 0,
          cancelledByMiddleware: false,
          propagationStopped: false,
          errors: [],
        };
      },
    };
    const scheduler = new Scheduler({ eventBus: fakeBus as never });
    scheduler.schedule(() => {});

    await vi.advanceTimersByTimeAsync(0);

    expect(published.map((p) => p.type)).toEqual([
      "scheduler.task.start",
      "scheduler.task.complete",
    ]);
  });

  it("notifica error a través de un EventBus inyectado", async () => {
    const published: string[] = [];
    const fakeBus = {
      publish: async (type: string) => {
        published.push(type);
        return {
          eventId: "e",
          type,
          matched: 0,
          delivered: 0,
          cancelledByMiddleware: false,
          propagationStopped: false,
          errors: [],
        };
      },
    };
    const scheduler = new Scheduler({ eventBus: fakeBus as never });
    scheduler.schedule(() => {
      throw new Error("boom");
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(published).toContain("scheduler.task.error");
  });

  it("registra el ciclo de vida a través de un Logger inyectado", async () => {
    const logs: Array<{ level: string; message: string }> = [];
    const fakeLogger = {
      withCorrelationId: () => fakeLogger,
      info: async (message: string) => void logs.push({ level: "info", message }),
      error: async (message: string) => void logs.push({ level: "error", message }),
      debug: async (message: string) => void logs.push({ level: "debug", message }),
    };
    const scheduler = new Scheduler({ logger: fakeLogger as never });
    scheduler.schedule(() => {});

    await vi.advanceTimersByTimeAsync(0);

    expect(logs.map((l) => l.level)).toEqual(["info", "info"]);
  });

  it("statistics() refleja los contadores acumulados", async () => {
    const scheduler = new Scheduler();
    scheduler.schedule(() => {});
    scheduler.schedule(() => {
      throw new Error("falla");
    });

    await vi.advanceTimersByTimeAsync(0);

    const stats = scheduler.statistics();
    expect(stats.totalStarted).toBe(2);
    expect(stats.totalCompleted).toBe(1);
    expect(stats.totalFailed).toBe(1);
  });

  it("getTask() devuelve la instantánea de una tarea existente y undefined si no existe", () => {
    const scheduler = new Scheduler();
    const handle = scheduler.schedule(() => {}, { id: "t1" });
    expect(scheduler.getTask("t1")).toMatchObject({ id: "t1" });
    expect(scheduler.getTask("no-existe")).toBeUndefined();
    expect(handle.snapshot().id).toBe("t1");
  });
});

describe("Scheduler — apagado limpio", () => {
  it("shutdown() rechaza nuevas tareas tras invocarse", async () => {
    const scheduler = new Scheduler();
    await scheduler.shutdown();
    expect(() => scheduler.schedule(() => {})).toThrow(
      expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_SHUTTING_DOWN })
    );
  });

  it("shutdown() espera a que las ejecuciones en curso terminen", async () => {
    const scheduler = new Scheduler();
    let resolveTask: () => void = () => {};
    scheduler.schedule(
      () =>
        new Promise<void>((resolve) => {
          resolveTask = resolve;
        })
    );

    await vi.advanceTimersByTimeAsync(0);

    let shutdownCompleted = false;
    const shutdownPromise = scheduler.shutdown().then(() => {
      shutdownCompleted = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(shutdownCompleted).toBe(false);

    resolveTask();
    await shutdownPromise;
    expect(shutdownCompleted).toBe(true);
  });

  it("shutdown() no espera indefinidamente: respeta shutdownGraceMs", async () => {
    const scheduler = new Scheduler({ configuration: { shutdownGraceMs: 1000 } });
    scheduler.schedule(() => new Promise<void>(() => {}));

    await vi.advanceTimersByTimeAsync(0);

    let shutdownCompleted = false;
    const shutdownPromise = scheduler.shutdown().then(() => {
      shutdownCompleted = true;
    });

    await vi.advanceTimersByTimeAsync(1000);
    await shutdownPromise;

    expect(shutdownCompleted).toBe(true);
  });

  it("shutdown() resuelve inmediatamente si no hay ejecuciones en curso", async () => {
    const scheduler = new Scheduler();
    await expect(scheduler.shutdown()).resolves.toBeUndefined();
  });
});
