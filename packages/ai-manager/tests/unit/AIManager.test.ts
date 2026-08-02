import { describe, it, expect, vi } from "vitest";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { Scheduler } from "@dwm/scheduler";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { AIManager } from "../../src/AIManager.js";
import { AIErrorCode } from "../../src/errors/AIErrorCode.js";
import { makeFakeProvider } from "./support/fakeProvider.js";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "dwm-ai-manager-"));
}

const BASE_CONFIG = { timeoutMs: 200, retry: { maxAttempts: 2, backoff: { baseDelayMs: 5 } } };

function makeFakeSecretsManager(values: Record<string, string>) {
  return { getSecret: async (key: string) => values[key] };
}

describe("AIManager — registro y selección de proveedor", () => {
  it("registerProvider() registra y deja activo el primero", async () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    manager.registerProvider(makeFakeProvider({ id: "p1" }));
    expect(manager.listProviders()).toEqual(["p1"]);
    expect(manager.getActiveProviderId()).toBe("p1");
  });

  it("registerProviderFactory() construye y registra el proveedor", async () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    const provider = await manager.registerProviderFactory({
      create: () => makeFakeProvider({ id: "p1" }),
    });
    expect(provider.id).toBe("p1");
    expect(manager.listProviders()).toEqual(["p1"]);
  });

  it("unregisterProvider() elimina el proveedor; lanza si no existe", () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    manager.registerProvider(makeFakeProvider({ id: "p1" }));
    manager.unregisterProvider("p1");
    expect(manager.listProviders()).toEqual([]);
    expect(() => manager.unregisterProvider("p1")).toThrow(
      expect.objectContaining({ code: AIErrorCode.AI_PROVIDER_NOT_FOUND })
    );
  });

  it("setActiveProvider() cambia el proveedor activo", () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    manager.registerProvider(makeFakeProvider({ id: "p1" }));
    manager.registerProvider(makeFakeProvider({ id: "p2" }));
    manager.setActiveProvider("p2");
    expect(manager.getActiveProviderId()).toBe("p2");
  });

  it("getConnection() refleja el estado de conexión de un proveedor", () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    manager.registerProvider(makeFakeProvider({ id: "p1" }));
    expect(manager.getConnection("p1")?.status).toBe("disconnected");
  });
});

describe("AIManager — envío de solicitudes", () => {
  it("sendRequest() usa el proveedor activo por defecto y devuelve una respuesta completa", async () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    manager.registerProvider(makeFakeProvider({ id: "p1" }));

    const response = await manager.sendRequest({ prompt: "hola" });

    expect(response).toMatchObject({ providerId: "p1", content: "respuesta a: hola", attempt: 1 });
    expect(typeof response.latencyMs).toBe("number");
  });

  it("sendRequest() acepta un providerId explícito", async () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    manager.registerProvider(makeFakeProvider({ id: "p1" }));
    manager.registerProvider(makeFakeProvider({ id: "p2" }));

    const response = await manager.sendRequest({ prompt: "hola" }, "p2");

    expect(response.providerId).toBe("p2");
  });

  it("sendRequest() reintenta con backoff y tiene éxito antes de agotar los intentos", async () => {
    const manager = new AIManager({
      configuration: { timeoutMs: 200, retry: { maxAttempts: 3, backoff: { baseDelayMs: 5 } } },
    });
    manager.registerProvider(makeFakeProvider({ id: "p1", failRequests: 1 }));

    const response = await manager.sendRequest({ prompt: "hola" });

    expect(response.attempt).toBe(2);
  });

  it("sendRequest() lanza AI_REQUEST_FAILED si se agotan los reintentos", async () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    manager.registerProvider(makeFakeProvider({ id: "p1", failRequests: 10 }));

    await expect(manager.sendRequest({ prompt: "hola" })).rejects.toMatchObject({
      code: AIErrorCode.AI_REQUEST_FAILED,
    });
  });

  it("sendRequest() envuelve un timeout como fallo (y reintenta según la configuración)", async () => {
    const manager = new AIManager({
      configuration: { timeoutMs: 20, retry: { maxAttempts: 1, backoff: { baseDelayMs: 5 } } },
    });
    manager.registerProvider(makeFakeProvider({ id: "p1", hang: true }));

    await expect(manager.sendRequest({ prompt: "hola" })).rejects.toMatchObject({
      code: AIErrorCode.AI_REQUEST_TIMEOUT,
    });
  });

  it("sendRequest() lanza AI_NO_ACTIVE_PROVIDER si no hay proveedor activo ni providerId", async () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    await expect(manager.sendRequest({ prompt: "hola" })).rejects.toMatchObject({
      code: AIErrorCode.AI_NO_ACTIVE_PROVIDER,
    });
  });

  it("sendRequest() resuelve la credencial declarada mediante SecretsManager", async () => {
    const manager = new AIManager({
      configuration: BASE_CONFIG,
      secretsManager: makeFakeSecretsManager({ "openai-key": "s3cr3t" }) as never,
    });
    let receivedCredential: string | undefined;
    manager.registerProvider(
      makeFakeProvider({ id: "p1", onSendRequest: (_r, c) => (receivedCredential = c) }),
      {
        credentialKey: "openai-key",
      }
    );

    await manager.sendRequest({ prompt: "hola" });

    expect(receivedCredential).toBe("s3cr3t");
  });

  it("sendRequest() lanza AI_CREDENTIAL_MISSING si el proveedor requiere credencial y no hay SecretsManager", async () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    manager.registerProvider(makeFakeProvider({ id: "p1" }), { credentialKey: "openai-key" });

    await expect(manager.sendRequest({ prompt: "hola" })).rejects.toMatchObject({
      code: AIErrorCode.AI_CREDENTIAL_MISSING,
    });
  });

  it("sendRequest() lanza AI_CREDENTIAL_MISSING si el secreto no existe", async () => {
    const manager = new AIManager({
      configuration: BASE_CONFIG,
      secretsManager: makeFakeSecretsManager({}) as never,
    });
    manager.registerProvider(makeFakeProvider({ id: "p1" }), { credentialKey: "no-existe" });

    await expect(manager.sendRequest({ prompt: "hola" })).rejects.toMatchObject({
      code: AIErrorCode.AI_CREDENTIAL_MISSING,
    });
  });
});

describe("AIManager — health check", () => {
  it("checkHealth() usa el proveedor activo por defecto", async () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    manager.registerProvider(makeFakeProvider({ id: "p1", healthy: true }));

    await expect(manager.checkHealth()).resolves.toBe(true);
    expect(manager.getConnection("p1")?.status).toBe("connected");
  });

  it("checkHealth() acepta un providerId explícito", async () => {
    const manager = new AIManager({ configuration: BASE_CONFIG });
    manager.registerProvider(makeFakeProvider({ id: "p1", healthy: false }));

    await expect(manager.checkHealth("p1")).resolves.toBe(false);
  });
});

describe("AIManager — eventos y logging", () => {
  it("publica eventos completos a través de un EventBus inyectado", async () => {
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
    const manager = new AIManager({ configuration: BASE_CONFIG, eventBus: fakeBus as never });
    manager.registerProvider(makeFakeProvider({ id: "p1", healthy: true }));

    await manager.sendRequest({ prompt: "hola" });
    await manager.checkHealth();
    manager.setActiveProvider("p1");
    manager.unregisterProvider("p1");

    expect(published).toEqual([
      "ai.provider.registered",
      "ai.request.success",
      "ai.health.ok",
      "ai.provider.activated",
      "ai.provider.unregistered",
    ]);
  });

  it("registra el ciclo de vida a través de un Logger inyectado", async () => {
    const logs: string[] = [];
    const fakeLogger = {
      withCorrelationId: () => ({
        info: async (m: string) => void logs.push(m),
        error: async (m: string) => void logs.push(m),
      }),
    };
    const manager = new AIManager({ configuration: BASE_CONFIG, logger: fakeLogger as never });
    manager.registerProvider(makeFakeProvider({ id: "p1" }));

    await manager.sendRequest({ prompt: "hola" });

    expect(logs.some((m) => m.includes("ai:request.success"))).toBe(true);
  });
});

describe("AIManager — integración con Config, Scheduler y Core", () => {
  it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const configManager = new ConfigManager({ configDir: tempDir() });
    const manager = new AIManager({ configuration: BASE_CONFIG, configManager });
    manager.registerProvider(makeFakeProvider({ id: "p1" }));

    await core.registerModule(manager);

    expect(await configManager.getSection("ai-manager")).toEqual({
      providers: ["p1"],
      activeProviderId: "p1",
    });

    await core.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("programa el health check periódico a través de un Scheduler inyectado", async () => {
    const scheduler = new Scheduler();
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const manager = new AIManager({
      configuration: { ...BASE_CONFIG, healthCheckIntervalMs: 1000 },
      scheduler,
    });
    let checks = 0;
    manager.registerProvider(makeFakeProvider({ id: "p1", onHealthCheck: () => (checks += 1) }));

    vi.useFakeTimers();
    try {
      await core.registerModule(manager);
      await vi.advanceTimersByTimeAsync(1000);
    } finally {
      vi.useRealTimers();
    }

    expect(checks).toBeGreaterThan(0);

    await core.shutdown();
    await scheduler.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("dispose() cancela la tarea de health check programada", async () => {
    const scheduler = new Scheduler();
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const manager = new AIManager({
      configuration: { ...BASE_CONFIG, healthCheckIntervalMs: 1000 },
      scheduler,
    });
    manager.registerProvider(makeFakeProvider({ id: "p1" }));
    await core.registerModule(manager);

    expect(scheduler.statistics().scheduledCount).toBe(1);
    await core.unregisterModule("ai-manager");
    expect(scheduler.statistics().scheduledCount).toBe(0);

    await core.shutdown();
    await scheduler.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
    const manager = new AIManager({ configuration: BASE_CONFIG });

    await core.registerModule(manager);

    expect(core.listModules()).toEqual([
      expect.objectContaining({ id: "ai-manager", status: "OK" }),
    ]);

    await core.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });
});
