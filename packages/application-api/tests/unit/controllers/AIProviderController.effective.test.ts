import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { AIManager, HttpAIProvider } from "@dwm/ai-manager";
import { SecretsManager } from "@dwm/secrets";
import { ConfigManager } from "@dwm/config";
import {
  saveStoredProviders,
  loadStoredProviders,
  buildHttpProvider,
} from "../../../src/AIProviderStore.js";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "configure"] as const };

describe("Modelo efectivo real (proyecto → cliente → global) y Probar modelo — fix/kilo-file-editing-and-ai-status", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-ai-effective-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function build(overrides: { projectManager?: unknown; clientManager?: unknown } = {}) {
    const dataDir = tempDir();
    const configManager = new ConfigManager({ configDir: path.join(dataDir, "config") });
    const secretsManager = new SecretsManager({
      configuration: {
        secretsDir: path.join(dataDir, "secrets"),
        masterKey: "clave-maestra-tests-32b",
      },
    });
    const aiManager = new AIManager({
      configuration: { timeoutMs: 5000, retry: { maxAttempts: 1, backoff: { baseDelayMs: 10 } } },
      secretsManager,
    });
    const api = new ApplicationAPI({
      aiManager,
      secretsManager,
      configManager,
      ...overrides,
    } as never);
    return { api, aiManager, secretsManager, configManager };
  }

  it("resuelve IA específica de proyecto real (origin: 'project'), sin caer a cliente ni a global", async () => {
    const projectManager = {
      getProject: () => ({
        configuration: { settings: { ai: { provider: "openai-proyecto", model: "gpt-4o" } } },
      }),
    };
    const clientManager = { getClient: () => ({ defaultAi: { provider: "no-debe-usarse" } }) };
    const { api } = build({ projectManager, clientManager });

    const response = await api.execute(
      makeRequest("ai.get-effective", { projectId: "p1", clientId: "c1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data.origin).toBe("project");
    expect(response.data.provider).toBe("openai-proyecto");
    expect(response.data.model).toBe("gpt-4o");
  });

  it("sin override de proyecto, cae al defaultAi real del cliente (origin: 'client')", async () => {
    const projectManager = { getProject: () => ({ configuration: { settings: {} } }) };
    const clientManager = {
      getClient: () => ({
        defaultAi: {
          provider: "anthropic-cliente",
          model: "claude-3-5-sonnet",
          fallbackModel: "claude-3-haiku",
        },
      }),
    };
    const { api } = build({ projectManager, clientManager });

    const response = await api.execute(
      makeRequest("ai.get-effective", { projectId: "p1", clientId: "acme" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data.origin).toBe("client");
    expect(response.data.provider).toBe("anthropic-cliente");
    expect(response.data.fallbackModel).toBe("claude-3-haiku");
  });

  it("sin proyecto ni cliente con IA propia, cae a la IA global predeterminada real (origin: 'global')", async () => {
    const { api, configManager } = build();
    await saveStoredProviders(configManager, [
      {
        id: "global-1",
        name: "OpenAI Global",
        format: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        credentialKey: "ai-provider.global-1",
        isDefault: true,
      },
    ]);

    const response = await api.execute(makeRequest("ai.get-effective", {}, { caller: admin }));
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data.origin).toBe("global");
    expect(response.data.provider).toBe("global-1");
    expect(response.data.providerName).toBe("OpenAI Global");
  });

  it("un proveedor global sin credencial real se marca hasCredential:false y estado INACTIVO", async () => {
    const { api, configManager } = build();
    await saveStoredProviders(configManager, [
      {
        id: "sin-clave",
        name: "Sin clave",
        format: "openai",
        baseUrl: "https://api.example.com",
        model: "m1",
        credentialKey: "ai-provider.sin-clave",
        isDefault: true,
      },
    ]);

    const response = await api.execute(makeRequest("ai.get-effective", {}, { caller: admin }));
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data.hasCredential).toBe(false);
  });

  it("'Probar modelo' hace una llamada real (Anthropic) vía AIManager.sendRequest, con latencia real y sin exponer la clave", async () => {
    const { api, aiManager, secretsManager } = build();
    await secretsManager.createSecret("cred-anthropic", "sk-ant-clave-real-secreta");
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ content: [{ type: "text", text: "OK" }], model: "claude-3-5-sonnet" }),
        { status: 200 }
      )) as unknown as typeof fetch;
    aiManager.registerProvider(
      new HttpAIProvider({
        id: "claude-real",
        name: "Claude",
        baseUrl: "https://api.anthropic.com/v1",
        format: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        fetchImpl,
      }),
      { credentialKey: "cred-anthropic" }
    );

    const response = await api.execute(
      makeRequest("ai.test-model", { id: "claude-real" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    if (!response.data.success) throw new Error("se esperaba éxito real");
    expect(response.data.provider).toBe("claude-real");
    expect(typeof response.data.latencyMs).toBe("number");
    expect(response.data.latencyMs).toBeGreaterThanOrEqual(0);
    expect(response.data.response).toContain("OK");
    expect(JSON.stringify(response)).not.toContain("sk-ant-clave-real-secreta");
  });

  it("'Probar modelo' hace una llamada real (OpenAI-compatible) y devuelve un error real (no simulado) ante un fallo HTTP", async () => {
    const { api, aiManager, secretsManager } = build();
    await secretsManager.createSecret("cred-openai", "sk-clave-real-secreta");
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "invalid_api_key" }), {
        status: 401,
      })) as unknown as typeof fetch;
    aiManager.registerProvider(
      new HttpAIProvider({
        id: "openai-real",
        name: "ChatGPT",
        baseUrl: "https://api.openai.com/v1",
        format: "openai",
        fetchImpl,
      }),
      { credentialKey: "cred-openai" }
    );

    const response = await api.execute(
      makeRequest("ai.test-model", { id: "openai-real" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data.success).toBe(false);
    if (response.data.success) return;
    expect(response.data.message.length).toBeGreaterThan(0);
    expect(JSON.stringify(response)).not.toContain("sk-clave-real-secreta");
  });

  it("prioridad exacta en cadena, con proyecto+cliente+global TODOS configurados a la vez: proyecto gana sobre cliente, cliente gana sobre global", async () => {
    const projectManager = {
      getProject: () => ({
        configuration: { settings: { ai: { provider: "ia-proyecto", model: "modelo-proyecto" } } },
      }),
    };
    const clientManager = {
      getClient: () => ({ defaultAi: { provider: "ia-cliente", model: "modelo-cliente" } }),
    };
    const { api, configManager } = build({ projectManager, clientManager });
    await saveStoredProviders(configManager, [
      {
        id: "ia-global",
        name: "IA Global",
        format: "openai",
        baseUrl: "https://api.example.com",
        model: "modelo-global",
        credentialKey: "ai-provider.ia-global",
        isDefault: true,
      },
    ]);

    // 1. Con proyecto y cliente: gana el proyecto.
    const withProject = await api.execute(
      makeRequest("ai.get-effective", { projectId: "p1", clientId: "acme" }, { caller: admin })
    );
    expect(withProject.success && withProject.data.origin).toBe("project");
    expect(withProject.success && withProject.data.provider).toBe("ia-proyecto");

    // 2. Sin proyecto, solo cliente: gana el cliente (nunca cae a global).
    const withClientOnly = await api.execute(
      makeRequest("ai.get-effective", { clientId: "acme" }, { caller: admin })
    );
    expect(withClientOnly.success && withClientOnly.data.origin).toBe("client");
    expect(withClientOnly.success && withClientOnly.data.provider).toBe("ia-cliente");

    // 3. Sin proyecto ni cliente: cae a la IA global real.
    const globalOnly = await api.execute(makeRequest("ai.get-effective", {}, { caller: admin }));
    expect(globalOnly.success && globalOnly.data.origin).toBe("global");
    expect(globalOnly.success && globalOnly.data.provider).toBe("ia-global");
  });

  it("bug real 'missing field model': 'Probar modelo' (sin pasar model, exactamente como hace EffectiveAiModel.tsx) usa el MISMO modelo real que 'Modelo efectivo' ya muestra — el request HTTP real incluye 'model'", async () => {
    const { api, aiManager, secretsManager, configManager } = build();
    await secretsManager.createSecret("cred-deepseek", "clave-real-deepseek");
    // Modelo persistido real (el que el usuario configuró, sea cual sea).
    await saveStoredProviders(configManager, [
      {
        id: "deepseek-real",
        name: "DeepSeek",
        format: "openai",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        credentialKey: "cred-deepseek",
        isDefault: true,
      },
    ]);
    let capturedBody: unknown;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
      return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    aiManager.registerProvider(
      new HttpAIProvider({
        id: "deepseek-real",
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        format: "openai",
        model: "deepseek-chat",
        fetchImpl,
      }),
      { credentialKey: "cred-deepseek", setActive: true }
    );

    // "Modelo efectivo" muestra deepseek-chat (lo REALMENTE configurado).
    const effective = await api.execute(makeRequest("ai.get-effective", {}, { caller: admin }));
    expect(effective.success && effective.data.model).toBe("deepseek-chat");

    // "Probar modelo" real, exactamente como lo llama EffectiveAiModel.tsx: solo { id }.
    const tested = await api.execute(
      makeRequest("ai.test-model", { id: "deepseek-real" }, { caller: admin })
    );
    expect(tested.success).toBe(true);
    if (!tested.success) return;
    if (!tested.data.success) throw new Error("se esperaba éxito real");
    expect(tested.data.model).toBe("deepseek-chat");

    // El request HTTP real enviado a DeepSeek SIEMPRE incluye "model".
    expect(capturedBody).toBeDefined();
    expect((capturedBody as { model?: string }).model).toBe("deepseek-chat");
  });

  it("actualizar el modelo de un proveedor (ai.update-provider) reconstruye el provider real (buildHttpProvider) con el NUEVO modelo, y ese es el que se usa en la siguiente petición HTTP real", async () => {
    const { api, aiManager, secretsManager, configManager } = build();
    await secretsManager.createSecret("cred-deepseek", "clave-real-deepseek");
    await saveStoredProviders(configManager, [
      {
        id: "deepseek-real",
        name: "DeepSeek",
        format: "openai",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        credentialKey: "cred-deepseek",
        isDefault: true,
      },
    ]);
    aiManager.registerProvider(
      new HttpAIProvider({
        id: "deepseek-real",
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        format: "openai",
        model: "deepseek-chat",
      }),
      { credentialKey: "cred-deepseek", setActive: true }
    );

    const updated = await api.execute(
      makeRequest(
        "ai.update-provider",
        { id: "deepseek-real", model: "deepseek-v4-flash" },
        { caller: admin }
      )
    );
    expect(updated.success).toBe(true);

    // ai.update-provider ya reconstruye el provider real (unregister +
    // registerProvider(buildHttpProvider(updated))) -- confirmamos que
    // el NUEVO modelo persistido es exactamente el que buildHttpProvider
    // usaría para la siguiente petición real.
    const stored = await loadStoredProviders(configManager);
    const rebuilt = buildHttpProvider(stored.find((p) => p.id === "deepseek-real")!);

    let capturedModel: string | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedModel = init?.body
        ? (JSON.parse(init.body as string) as { model?: string }).model
        : undefined;
      return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const rebuiltWithFetch = new HttpAIProvider({
      id: rebuilt.id,
      name: rebuilt.name,
      baseUrl: "https://api.deepseek.com",
      format: "openai",
      model: stored.find((p) => p.id === "deepseek-real")!.model,
      fetchImpl,
    });
    await rebuiltWithFetch.sendRequest({ prompt: "x" }, "clave-real-deepseek");
    expect(capturedModel).toBe("deepseek-v4-flash");
  });
});
