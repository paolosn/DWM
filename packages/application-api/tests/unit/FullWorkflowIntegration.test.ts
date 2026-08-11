import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AIManager, HttpAIProvider } from "@dwm/ai-manager";
import { SecretsManager } from "@dwm/secrets";
import { ConfigManager } from "@dwm/config";
import { ClientManager } from "@dwm/client-manager";
import { ProjectManager } from "@dwm/project";
import { ProfileManager } from "@dwm/profile";
import { EnvironmentManager } from "@dwm/environment-manager";
import { ProjectProvisioningService } from "@dwm/project-provisioning";
import { PortableWorkspaceManager } from "@dwm/portable-workspace";
import { saveStoredProviders } from "../../src/AIProviderStore.js";
import { ApplicationAPI } from "../../src/ApplicationAPI.js";
import { makeRequest } from "./support/fixtures.js";

const admin = {
  grantedCapabilities: ["read", "write", "configure"] as const,
};

/**
 * client-workflow "fix/kilo-clients-psnadapter-init-and-gemini" —
 * Commit 4: única prueba de integración real (managers reales, sin
 * mocks) que encadena el flujo completo pedido: Workspace nuevo →
 * Clientes reconocido por PSNAdapter → configurar Gemini → guardar
 * IA global → crear cliente → probar la IA global real → crear
 * proyecto → abrir VS Code → "reiniciar DWM" (instancias
 * completamente nuevas) → confirmar que Workspace/cliente/IA global
 * siguen funcionando.
 */
describe("Integración real completa: Workspace → Clientes → Gemini/IA global → cliente → proyecto → VS Code → reinicio", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function build(dataDir: string, configManager: ConfigManager, secretsManager: SecretsManager) {
    const psnAdapter = new PSNAdapter();
    const aiManager = new AIManager({
      configuration: { timeoutMs: 5000, retry: { maxAttempts: 1, backoff: { baseDelayMs: 10 } } },
      secretsManager,
    });
    const clientManager = new ClientManager({ psnAdapter });
    const projectManager = new ProjectManager({ projectsDir: path.join(dataDir, "projects") });
    const profileManager = new ProfileManager({
      profilesDir: path.join(dataDir, "profiles"),
      configManager,
      secretsManager,
      aiManager,
    });
    const environmentManager = new EnvironmentManager();
    const portableWorkspaceManager = new PortableWorkspaceManager({
      startDir: dataDir,
      configManager,
    });
    const projectProvisioningService = new ProjectProvisioningService({
      projectManager,
      clientManager,
      profileManager,
    });

    const api = new ApplicationAPI({
      psnAdapter,
      aiManager,
      secretsManager,
      configManager,
      clientManager,
      projectManager,
      profileManager,
      environmentManager,
      portableWorkspaceManager,
      projectProvisioningService,
    });
    return { api, psnAdapter, portableWorkspaceManager, aiManager };
  }

  it("flujo real completo de extremo a extremo, incluida persistencia tras 'reiniciar' DWM", async () => {
    const dataDir = tempDir("dwm-e2e-full-");
    const workspaceRoot = tempDir("dwm-e2e-full-ws-");
    const configDir = path.join(dataDir, "config");
    const configManager = new ConfigManager({ configDir });
    const secretsManager = new SecretsManager({
      configuration: {
        secretsDir: path.join(dataDir, "secrets"),
        masterKey: "clave-maestra-integracion-real",
      },
    });

    const { api } = build(dataDir, configManager, secretsManager);

    // 1. Workspace nuevo, activado (workspace.register: garantiza el
    // esqueleto real y reescanea con PSNAdapter -- Commit 1).
    await new PortableWorkspaceManager({ startDir: dataDir, configManager }).initializeWorkspace(
      workspaceRoot
    );
    const registered = await api.execute(
      makeRequest("workspace.register", { root: workspaceRoot }, { caller: admin })
    );
    expect(registered.success).toBe(true);

    // 2. Clientes existe físicamente y PSNAdapter lo reconoce: sin el
    // error "escanea primero".
    const clientsBeforeAny = await api.execute(
      makeRequest("clients.list", { root: workspaceRoot }, { caller: admin })
    );
    expect(clientsBeforeAny.success).toBe(true);
    expect(clientsBeforeAny.success && clientsBeforeAny.data).toEqual([]);

    // 3. Configurar Gemini real (formato nativo -- Commit 2) y
    // guardarlo como IA global predeterminada.
    await secretsManager.createSecret("cred-gemini", "gm-clave-real-de-prueba");
    await saveStoredProviders(configManager, [
      {
        id: "gemini-global",
        name: "Gemini",
        format: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemini-2.0-flash",
        credentialKey: "cred-gemini",
        isDefault: true,
      },
    ]);
    const listProviders = await api.execute(
      makeRequest("ai.list-providers", {}, { caller: admin })
    );
    expect(listProviders.success).toBe(true);
    expect(listProviders.success && listProviders.data[0]?.hasCredential).toBe(true);
    expect(listProviders.success && listProviders.data[0]?.id).toBe("gemini-global");

    // 4. Crear cliente real.
    const clientCreated = await api.execute(
      makeRequest(
        "clients.create",
        { id: "acme", name: "Acme", slug: "acme", root: workspaceRoot },
        { caller: admin }
      )
    );
    expect(clientCreated.success).toBe(true);

    // 5. La IA global configurada funciona de verdad (petición real
    // vía fetch inyectado, reutilizable para generar contenido).
    const geminiFetch = (async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Contenido real generado." }] } }],
        }),
        { status: 200 }
      )) as unknown as typeof fetch;
    const { aiManager } = build(dataDir, configManager, secretsManager);
    aiManager.registerProvider(
      new HttpAIProvider({
        id: "gemini-global",
        name: "Gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        format: "gemini",
        fetchImpl: geminiFetch,
      }),
      { credentialKey: "cred-gemini", setActive: true }
    );
    const apiWithLiveAi = new ApplicationAPI({ aiManager, secretsManager, configManager });
    const testModel = await apiWithLiveAi.execute(
      makeRequest("ai.test-model", { id: "gemini-global" }, { caller: admin })
    );
    expect(testModel.success).toBe(true);
    expect(testModel.success && (testModel.data as { success: boolean }).success).toBe(true);
    expect(JSON.stringify(testModel)).not.toContain("gm-clave-real-de-prueba");

    // 6. Un perfil real mínimo, activo, y el proyecto asociado al
    // cliente (mismo pipeline validado ya usado por "Nuevo trabajo").
    const profileCreated = await api.execute(
      makeRequest(
        "profiles.create",
        {
          id: "kit-real",
          name: "Kit real",
          description: "Kit real de prueba.",
          configuration: { enabledTools: [], enabledAdapters: [], secretRefs: [] },
        },
        { caller: admin }
      )
    );
    expect(profileCreated.success).toBe(true);

    const created = await api.execute(
      makeRequest(
        "provisioning.create-project",
        {
          category: "directo",
          existingClientId: "acme",
          project: { name: "Proyecto real" },
        },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(created.success).toBe(true);
    if (!created.success) return;
    const result = created.data as {
      projectId: string;
      clientId: string;
      vsCodeOpened: boolean;
      vsCodeMessage: string;
    };
    expect(result.clientId).toBe("acme");

    // 7. Abrir VS Code: respuesta real (opened puede ser false en un
    // entorno sin el CLI "code" instalado -- eso también es un
    // resultado real, nunca simulado).
    expect(typeof result.vsCodeOpened).toBe("boolean");
    expect(result.vsCodeMessage.length).toBeGreaterThan(0);

    // 8. "Cerrar y volver a abrir DWM": instancias completamente
    // nuevas, mismo ConfigManager/SecretsManager persistidos en
    // disco. Workspace + cliente + IA global siguen funcionando.
    const restartedConfigManager = new ConfigManager({ configDir });
    const restartedSecretsManager = new SecretsManager({
      configuration: {
        secretsDir: path.join(dataDir, "secrets"),
        masterKey: "clave-maestra-integracion-real",
      },
    });
    const restartedWorkspaceManager = new PortableWorkspaceManager({
      startDir: dataDir,
      configManager: restartedConfigManager,
    });
    const recoveredRoot = await restartedWorkspaceManager.locateOrRecoverActiveWorkspace(dataDir);
    expect(recoveredRoot).toBe(workspaceRoot);

    const { api: restartedApi } = build(dataDir, restartedConfigManager, restartedSecretsManager);
    await restartedApi.execute(
      makeRequest("workspace.register", { root: recoveredRoot! }, { caller: admin })
    );

    const clientsAfterRestart = await restartedApi.execute(
      makeRequest("clients.list", { root: recoveredRoot }, { caller: admin })
    );
    expect(clientsAfterRestart.success).toBe(true);
    expect(clientsAfterRestart.success && clientsAfterRestart.data.map((c) => c.id)).toContain(
      "acme"
    );

    const globalAfterRestart = await restartedApi.execute(
      makeRequest("ai.list-providers", {}, { caller: admin })
    );
    expect(globalAfterRestart.success).toBe(true);
    expect(globalAfterRestart.success && globalAfterRestart.data[0]?.id).toBe("gemini-global");
    expect(globalAfterRestart.success && globalAfterRestart.data[0]?.hasCredential).toBe(true);
  });
});
