import { describe, expect, it } from "vitest";
import { EventBus } from "@dwm/event-bus";
import { ApplicationRouter } from "../../src/ApplicationRouter.js";
import { ApplicationOperationRegistry } from "../../src/ApplicationOperationRegistry.js";
import { ApplicationPermissions } from "../../src/ApplicationPermissions.js";
import { ApplicationContext } from "../../src/ApplicationContext.js";
import { createApplicationError } from "../../src/errors/ApplicationError.js";
import { ApplicationErrorCode } from "../../src/errors/ApplicationErrorCode.js";
import { makeRequest } from "./support/fixtures.js";

function buildRouter() {
  const eventBus = new EventBus();
  const context = new ApplicationContext({ eventBus });
  const operations = new ApplicationOperationRegistry();
  const permissions = new ApplicationPermissions();
  const router = new ApplicationRouter({ operations, permissions, context });
  return { router, operations, permissions, context, eventBus };
}

function captureEvents(eventBus: EventBus, pattern = "application.**"): string[] {
  const seen: string[] = [];
  eventBus.subscribe(pattern, (envelope) => {
    seen.push(envelope.type);
  });
  return seen;
}

describe("ApplicationRouter", () => {
  it("ejecuta una operación válida y devuelve una respuesta exitosa normalizada", async () => {
    const { router, operations, permissions } = buildRouter();
    permissions.register("demo.echo", ["read"]);
    operations.register({
      name: "demo.echo",
      version: "1.0.0",
      capabilities: ["read"],
      handler: (payload: { value: string }) => ({ echoed: payload.value }),
    });

    const response = await router.dispatch(
      makeRequest("demo.echo", { value: "hola" }, { caller: { grantedCapabilities: ["read"] } })
    );

    expect(response.success).toBe(true);
    if (response.success) {
      expect(response.data).toEqual({ echoed: "hola" });
      expect(response.operation).toBe("demo.echo");
    }
  });

  it("responde con error normalizado para una operación desconocida", async () => {
    const { router } = buildRouter();
    const response = await router.dispatch(makeRequest("no.existe", {}));
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.code).toBe(ApplicationErrorCode.APP_UNKNOWN_OPERATION);
      expect(response.error.category).toBe("not-found");
    }
  });

  it("responde con error de validación cuando el payload no cumple validatePayload", async () => {
    const { router, operations, permissions } = buildRouter();
    permissions.register("demo.strict", ["read"]);
    operations.register({
      name: "demo.strict",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = payload as Record<string, unknown>;
        if (typeof record["id"] !== "string") {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: "id requerido",
            origin: "validation",
            category: "validation",
            retryable: false,
            recoverable: true,
          });
        }
        return record;
      },
      handler: () => ({ ok: true }),
    });

    const response = await router.dispatch(
      makeRequest("demo.strict", {}, { caller: { grantedCapabilities: ["read"] } })
    );
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.code).toBe(ApplicationErrorCode.APP_INVALID_PAYLOAD);
    }
  });

  it("responde con error normalizado cuando el handler lanza un error de dominio", async () => {
    const { router, operations, permissions } = buildRouter();
    permissions.register("demo.fails", ["read"]);
    operations.register({
      name: "demo.fails",
      version: "1.0.0",
      capabilities: ["read"],
      handler: () => {
        throw { code: "SOME_NOT_FOUND", message: "no encontrado", recoverable: true };
      },
    });

    const response = await router.dispatch(
      makeRequest("demo.fails", {}, { caller: { grantedCapabilities: ["read"] } })
    );
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.code).toBe("SOME_NOT_FOUND");
      expect(response.error.category).toBe("not-found");
    }
  });

  it("deniega por defecto cuando el caller no tiene las capacidades requeridas", async () => {
    const { router, operations, permissions } = buildRouter();
    permissions.register("demo.write", ["write"]);
    operations.register({
      name: "demo.write",
      version: "1.0.0",
      capabilities: ["write"],
      handler: () => ({ ok: true }),
    });

    const response = await router.dispatch(
      makeRequest("demo.write", {}, { caller: { grantedCapabilities: ["read"] } })
    );
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.code).toBe(ApplicationErrorCode.APP_PERMISSION_DENIED);
      expect(response.error.category).toBe("permission");
    }
  });

  it("deniega por defecto cuando no se indica ningún caller", async () => {
    const { router, operations, permissions } = buildRouter();
    permissions.register("demo.read", ["read"]);
    operations.register({
      name: "demo.read",
      version: "1.0.0",
      capabilities: ["read"],
      handler: () => ({ ok: true }),
    });

    const response = await router.dispatch(makeRequest("demo.read", {}));
    expect(response.success).toBe(false);
    if (!response.success)
      expect(response.error.code).toBe(ApplicationErrorCode.APP_PERMISSION_DENIED);
  });

  it("un contexto privilegiado explícito puede ejecutar una operación destructiva con confirmación", async () => {
    const { router, operations, permissions } = buildRouter();
    permissions.register("demo.delete", ["delete"], { destructive: true });
    operations.register({
      name: "demo.delete",
      version: "1.0.0",
      capabilities: ["delete"],
      destructive: true,
      handler: () => ({ deleted: true }),
    });

    const response = await router.dispatch(
      makeRequest(
        "demo.delete",
        {},
        { caller: { privileged: true }, confirmation: { confirmed: true } }
      )
    );
    expect(response.success).toBe(true);
  });

  it("exige confirmación explícita para operaciones destructivas incluso con permisos concedidos", async () => {
    const { router, operations, permissions } = buildRouter();
    permissions.register("demo.delete2", ["delete"], { destructive: true });
    operations.register({
      name: "demo.delete2",
      version: "1.0.0",
      capabilities: ["delete"],
      destructive: true,
      handler: () => ({ deleted: true }),
    });

    const withoutConfirmation = await router.dispatch(
      makeRequest("demo.delete2", {}, { caller: { grantedCapabilities: ["delete"] } })
    );
    expect(withoutConfirmation.success).toBe(false);
    if (!withoutConfirmation.success) {
      expect(withoutConfirmation.error.code).toBe(ApplicationErrorCode.APP_CONFIRMATION_REQUIRED);
    }

    const withConfirmation = await router.dispatch(
      makeRequest(
        "demo.delete2",
        {},
        {
          caller: { grantedCapabilities: ["delete"] },
          confirmation: { confirmed: true },
        }
      )
    );
    expect(withConfirmation.success).toBe(true);
  });

  it("rechaza un requestId duplicado en dos solicitudes sucesivas", async () => {
    const { router, operations, permissions } = buildRouter();
    permissions.register("demo.echo2", ["read"]);
    operations.register({
      name: "demo.echo2",
      version: "1.0.0",
      capabilities: ["read"],
      handler: () => ({ ok: true }),
    });

    const request = makeRequest("demo.echo2", {}, { caller: { grantedCapabilities: ["read"] } });
    const first = await router.dispatch(request);
    expect(first.success).toBe(true);

    const second = await router.dispatch(request);
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.error.code).toBe(ApplicationErrorCode.APP_DUPLICATE_REQUEST_ID);
    }
  });

  it("emite eventos normalizados durante el ciclo de vida de la solicitud", async () => {
    const { router, operations, permissions, eventBus } = buildRouter();
    const events = captureEvents(eventBus);
    permissions.register("demo.event", ["read"]);
    operations.register({
      name: "demo.event",
      version: "1.0.0",
      capabilities: ["read"],
      handler: () => ({ ok: true }),
    });

    await router.dispatch(
      makeRequest("demo.event", {}, { caller: { grantedCapabilities: ["read"] } })
    );

    expect(events).toContain("application.request.received");
    expect(events).toContain("application.request.validated");
  });

  it("emite application.permission.denied cuando se deniega el permiso", async () => {
    const { router, operations, permissions, eventBus } = buildRouter();
    const events = captureEvents(eventBus);
    permissions.register("demo.deny", ["write"]);
    operations.register({
      name: "demo.deny",
      version: "1.0.0",
      capabilities: ["write"],
      handler: () => ({ ok: true }),
    });

    await router.dispatch(makeRequest("demo.deny", {}));
    expect(events).toContain("application.permission.denied");
  });

  it("realiza el seguimiento de progreso completo de una operación larga hasta completarse", async () => {
    const { router, operations, permissions, eventBus } = buildRouter();
    const events = captureEvents(eventBus);
    permissions.register("demo.long", ["execute"]);
    operations.register({
      name: "demo.long",
      version: "1.0.0",
      capabilities: ["execute"],
      long: true,
      handler: async (_payload, _ctx, op) => {
        op?.reportProgress(50);
        return { finished: true };
      },
    });

    const response = await router.dispatch(
      makeRequest("demo.long", {}, { caller: { grantedCapabilities: ["execute"] } })
    );
    expect(response.success).toBe(true);
    if (response.success) {
      expect(response.metadata?.["operationId"]).toBeDefined();
    }
    expect(events).toContain("application.operation.started");
    expect(events).toContain("application.operation.completed");
  });

  it("normaliza el fallo de una operación larga como operation.failed", async () => {
    const { router, operations, permissions, eventBus } = buildRouter();
    const events = captureEvents(eventBus);
    permissions.register("demo.long-fail", ["execute"]);
    operations.register({
      name: "demo.long-fail",
      version: "1.0.0",
      capabilities: ["execute"],
      long: true,
      handler: async () => {
        throw createApplicationError({
          code: ApplicationErrorCode.APP_INTERNAL_ERROR,
          message: "fallo simulado",
          origin: "operation",
          category: "internal",
          retryable: false,
          recoverable: true,
        });
      },
    });

    const response = await router.dispatch(
      makeRequest("demo.long-fail", {}, { caller: { grantedCapabilities: ["execute"] } })
    );
    expect(response.success).toBe(false);
    expect(events).toContain("application.operation.failed");
  });

  it("procesa solicitudes concurrentes de forma independiente sin mezclar estado", async () => {
    const { router, operations, permissions } = buildRouter();
    permissions.register("demo.concurrent", ["read"]);
    operations.register({
      name: "demo.concurrent",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async (payload: { n: number }) => {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
        return { doubled: payload.n * 2 };
      },
    });

    const requests = Array.from({ length: 10 }, (_, i) =>
      makeRequest("demo.concurrent", { n: i }, { caller: { grantedCapabilities: ["read"] } })
    );
    const responses = await Promise.all(requests.map((req) => router.dispatch(req)));
    responses.forEach((response, i) => {
      expect(response.success).toBe(true);
      if (response.success) expect(response.data).toEqual({ doubled: i * 2 });
    });
  });

  it("normaliza un requestId u operación malformados sin lanzar", async () => {
    const { router } = buildRouter();
    // @ts-expect-error -- solicitud deliberadamente malformada
    const response = await router.dispatch({ requestId: "", operation: 123, payload: {} });
    expect(response.success).toBe(false);
  });
});
