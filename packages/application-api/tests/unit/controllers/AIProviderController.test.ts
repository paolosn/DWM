import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { AIManager } from "@dwm/ai-manager";
import { SecretsManager } from "@dwm/secrets";
import { ConfigManager } from "@dwm/config";
import { restoreStoredProviders } from "../../../src/AIProviderStore.js";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "configure"] as const };

describe("AIProviderController", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-ai-provider-ctrl-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function build(dataDir: string = tempDir()) {
    const configManager = new ConfigManager({ configDir: path.join(dataDir, "config") });
    const secretsManager = new SecretsManager({
      configuration: {
        secretsDir: path.join(dataDir, "secrets"),
        masterKey: "test-master-key-32-bytes-long!!",
      },
    });
    const aiManager = new AIManager({
      configuration: { timeoutMs: 5000, retry: { maxAttempts: 1, backoff: { baseDelayMs: 10 } } },
      secretsManager,
    });
    const api = new ApplicationAPI({ aiManager, secretsManager, configManager });
    return { api, aiManager, secretsManager, configManager, dataDir };
  }

  it("ai.add-provider crea un proveedor real, guarda la API key exclusivamente vía SecretsManager, y nunca la devuelve", async () => {
    const { api, secretsManager } = build();

    const response = await api.execute(
      makeRequest(
        "ai.add-provider",
        {
          id: "openai-1",
          name: "OpenAI",
          format: "openai",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o-mini",
          apiKey: "sk-real-secret-value",
        },
        { caller: admin }
      )
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    const provider = response.data;
    expect(provider.id).toBe("openai-1");
    expect(provider.hasCredential).toBe(true);
    expect(provider.isDefault).toBe(true);
    expect(JSON.stringify(provider)).not.toContain("sk-real-secret-value");

    // La API key solo vive en SecretsManager, resoluble por su clave real.
    const stored = await secretsManager.getSecret("ai-provider.openai-1");
    expect(stored).toBe("sk-real-secret-value");
  });

  it("ai.list-providers nunca expone la API key, solo hasCredential", async () => {
    const { api } = build();
    await api.execute(
      makeRequest(
        "ai.add-provider",
        {
          id: "anthropic-1",
          name: "Anthropic",
          format: "anthropic",
          baseUrl: "https://api.anthropic.com/v1",
          model: "claude-3-5-sonnet",
          apiKey: "anthropic-secret-key",
        },
        { caller: admin }
      )
    );

    const response = await api.execute(makeRequest("ai.list-providers", {}, { caller: admin }));
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data).toHaveLength(1);
    expect(response.data[0]?.hasCredential).toBe(true);
    expect(JSON.stringify(response.data)).not.toContain("anthropic-secret-key");
  });

  it("ai.update-provider edita metadatos reales y rota la credencial real cuando se indica apiKey", async () => {
    const { api, secretsManager } = build();
    await api.execute(
      makeRequest(
        "ai.add-provider",
        {
          id: "p1",
          name: "Proveedor 1",
          format: "openai",
          baseUrl: "https://old.example.com/v1",
          model: "modelo-viejo",
          apiKey: "clave-vieja",
        },
        { caller: admin }
      )
    );

    const response = await api.execute(
      makeRequest(
        "ai.update-provider",
        {
          id: "p1",
          baseUrl: "https://new.example.com/v1",
          model: "modelo-nuevo",
          apiKey: "clave-nueva",
        },
        { caller: admin }
      )
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data.baseUrl).toBe("https://new.example.com/v1");
    expect(response.data.model).toBe("modelo-nuevo");
    expect(await secretsManager.getSecret("ai-provider.p1")).toBe("clave-nueva");
  });

  it("ai.delete-provider elimina el proveedor real y su credencial real, sin dejar secretos huérfanos", async () => {
    const { api, secretsManager } = build();
    await api.execute(
      makeRequest(
        "ai.add-provider",
        {
          id: "p1",
          name: "Proveedor 1",
          format: "openai",
          baseUrl: "https://api.example.com/v1",
          model: "m1",
          apiKey: "clave-1",
        },
        { caller: admin }
      )
    );

    const response = await api.execute(
      makeRequest("ai.delete-provider", { id: "p1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(await secretsManager.hasSecret("ai-provider.p1")).toBe(false);

    const listAfter = await api.execute(makeRequest("ai.list-providers", {}, { caller: admin }));
    expect(listAfter.success).toBe(true);
    if (!listAfter.success) return;
    expect(listAfter.data).toHaveLength(0);
  });

  it("ai.set-default-provider marca un proveedor real como predeterminado", async () => {
    const { api } = build();
    await api.execute(
      makeRequest(
        "ai.add-provider",
        {
          id: "p1",
          name: "P1",
          format: "openai",
          baseUrl: "https://x.com",
          model: "m1",
          apiKey: "k1",
        },
        { caller: admin }
      )
    );
    await api.execute(
      makeRequest(
        "ai.add-provider",
        {
          id: "p2",
          name: "P2",
          format: "openai",
          baseUrl: "https://y.com",
          model: "m2",
          apiKey: "k2",
        },
        { caller: admin }
      )
    );

    const response = await api.execute(
      makeRequest("ai.set-default-provider", { id: "p2" }, { caller: admin })
    );
    expect(response.success).toBe(true);

    const list = await api.execute(makeRequest("ai.list-providers", {}, { caller: admin }));
    expect(list.success).toBe(true);
    if (!list.success) return;
    const p1 = list.data.find((p) => p.id === "p1");
    const p2 = list.data.find((p) => p.id === "p2");
    expect(p1?.isDefault).toBe(false);
    expect(p2?.isDefault).toBe(true);
  });

  it("ai.test-connection devuelve un resultado real (falla de verdad contra un endpoint inexistente)", async () => {
    const { api } = build();
    await api.execute(
      makeRequest(
        "ai.add-provider",
        {
          id: "p1",
          name: "P1",
          format: "openai",
          baseUrl: "http://localhost:1/no-existe",
          model: "m1",
          apiKey: "k1",
        },
        { caller: admin }
      )
    );

    const response = await api.execute(
      makeRequest("ai.test-connection", { id: "p1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.data.success).toBe(false);
    expect(response.data.message.length).toBeGreaterThan(0);
  });

  it("los proveedores reales persisten tras reiniciar el motor (restoreStoredProviders reconstruye AIManager)", async () => {
    const dataDir = tempDir();
    const first = build(dataDir);
    await first.api.execute(
      makeRequest(
        "ai.add-provider",
        {
          id: "p1",
          name: "Persistente",
          format: "openai",
          baseUrl: "https://api.example.com/v1",
          model: "modelo-real",
          apiKey: "clave-persistente",
        },
        { caller: admin }
      )
    );

    // "Reinicio" real: nuevas instancias de AIManager/ConfigManager/SecretsManager sobre el mismo dataDir.
    const configManager2 = new ConfigManager({ configDir: path.join(dataDir, "config") });
    const secretsManager2 = new SecretsManager({
      configuration: {
        secretsDir: path.join(dataDir, "secrets"),
        masterKey: "test-master-key-32-bytes-long!!",
      },
    });
    const aiManager2 = new AIManager({
      configuration: { timeoutMs: 5000, retry: { maxAttempts: 1, backoff: { baseDelayMs: 10 } } },
      secretsManager: secretsManager2,
    });
    await restoreStoredProviders(aiManager2, configManager2);

    expect(aiManager2.listProviders()).toContain("p1");
    expect(aiManager2.getActiveProviderId()).toBe("p1");
    // La credencial real también sobrevive, resoluble por la misma clave.
    expect(await secretsManager2.getSecret("ai-provider.p1")).toBe("clave-persistente");
  });

  it("la API key nunca aparece en el fichero de configuración persistido (solo metadatos + clave de referencia)", async () => {
    const dataDir = tempDir();
    const { api } = build(dataDir);
    await api.execute(
      makeRequest(
        "ai.add-provider",
        {
          id: "p1",
          name: "P1",
          format: "openai",
          baseUrl: "https://api.example.com/v1",
          model: "m1",
          apiKey: "super-secreta-no-debe-aparecer",
        },
        { caller: admin }
      )
    );

    const configDir = path.join(dataDir, "config");
    const files = readdirSync(configDir);
    for (const file of files) {
      const content = readFileSync(path.join(configDir, file), "utf-8");
      expect(content).not.toContain("super-secreta-no-debe-aparecer");
    }
  });
});
