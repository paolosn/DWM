import { describe, expect, it, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { ClientManager } from "@dwm/client-manager";
import { ProjectManager } from "@dwm/project";
import { ProfileManager } from "@dwm/profile";
import { ProjectProvisioningService, ViabilityAnalysisService } from "@dwm/project-provisioning";
import { EnvironmentManager } from "@dwm/environment-manager";
import { AIManager } from "@dwm/ai-manager";
import { SecretsManager } from "@dwm/secrets";
import type { PortableWorkspaceManager, WorkspaceRegistryEntry } from "@dwm/portable-workspace";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "execute"] as const };

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const VALID_REPORT = {
  veredicto: "Viable",
  puntuacion: 80,
  resumen: "Proyecto claro y acotado.",
  requerimientoCliente: "El cliente pide una landing page.",
  objetivo: "Presentar el negocio online.",
  alcanceFuncional: "Landing con formulario de contacto.",
  alcanceTecnico: "WordPress con tema a medida.",
  tecnologiasDetectadas: ["WordPress"],
  riesgos: ["Plazo ajustado"],
  dependencias: [],
  complejidad: "Media",
  plazoEstimado: "2-3 semanas",
  costeOrientativo: "1.500-2.000 €",
  perfilRecomendado: "WordPress Cliente",
  proyectoRecomendado: { reutilizarExistente: false, detalle: "Cliente nuevo." },
  recursosRecomendados: { agentes: [], skills: [], reglas: [], ia: "", mcp: [] },
  preguntasPendientes: ["¿Hosting ya contratado?"],
  recomendacion: "Aceptar.",
  siguientePaso: "Agendar arranque.",
  datosConfirmados: [],
  inferencias: [],
};

describe("ProvisioningController", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  async function makeFakeWorkspace(withPsnBase: boolean): Promise<{ root: string }> {
    const root = tempDir("dwm-provisioning-controller-ws-");
    await fs.mkdir(path.join(root, "CLIENTES"), { recursive: true });
    if (withPsnBase) {
      await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
      await fs.writeFile(
        path.join(root, "PSN-BASE", "estado-proyecto.md"),
        "Nombre: Pendiente de definir\n"
      );
    }
    return { root };
  }

  function fakeWorkspaceManager(root: string | undefined): PortableWorkspaceManager {
    return {
      getActiveWorkspace: (): WorkspaceRegistryEntry | undefined =>
        root
          ? {
              root,
              metadata: { id: "ws-1", name: "ws", createdAt: "", updatedAt: "" } as never,
              registeredAt: new Date().toISOString(),
            }
          : undefined,
    } as unknown as PortableWorkspaceManager;
  }

  async function buildApi(
    options: {
      withWorkspace?: boolean;
      withPsnBase?: boolean;
      aiFetch?: ReturnType<typeof vi.fn>;
    } = {}
  ) {
    const { withWorkspace = true, withPsnBase = true } = options;
    const workspace = withWorkspace ? await makeFakeWorkspace(withPsnBase) : undefined;

    const psnAdapter = new PSNAdapter();
    if (workspace) await psnAdapter.scanWorkspace(workspace.root);

    const clientManager = new ClientManager({ psnAdapter });
    const projectManager = new ProjectManager({
      projectsDir: tempDir("dwm-provisioning-controller-projects-"),
    });
    const profileManager = new ProfileManager({
      profilesDir: tempDir("dwm-provisioning-controller-profiles-"),
    });
    await profileManager.createProfile("Perfil por defecto", "pruebas");

    const projectProvisioningService = new ProjectProvisioningService({
      clientManager,
      projectManager,
      profileManager,
    });

    const environmentManager = new EnvironmentManager({ includeBuiltinDetectors: [] });

    const secretsManager = new SecretsManager({
      configuration: {
        secretsDir: tempDir("dwm-provisioning-controller-secrets-"),
        masterKey: "clave-maestra-tests-provisioning",
      },
    });
    const aiManager = new AIManager({
      configuration: { timeoutMs: 2000, retry: { maxAttempts: 1, backoff: { baseDelayMs: 5 } } },
      secretsManager,
    });
    const viabilityAnalysisService = new ViabilityAnalysisService(aiManager, options.aiFetch);

    const api = new ApplicationAPI({
      projectProvisioningService,
      portableWorkspaceManager: fakeWorkspaceManager(workspace?.root),
      environmentManager,
      clientManager,
      projectManager,
      aiManager,
      viabilityAnalysisService,
    });

    return { api, clientManager, projectManager, aiManager, secretsManager };
  }

  it("provisioning.create-project crea cliente y proyecto reales duplicando PSN-BASE, sin pedir ruta ni perfil", async () => {
    const { api, projectManager } = await buildApi();
    const response = await api.execute(
      makeRequest(
        "provisioning.create-project",
        {
          category: "directo",
          client: { name: "MCI Finance" },
          project: { name: "Portal de Clientes" },
        },
        { caller: admin }
      )
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    const data = response.data as {
      clientId: string;
      clientCreated: boolean;
      projectId: string;
      vsCodeOpened: boolean;
      vsCodeMessage: string;
    };
    expect(data.clientCreated).toBe(true);
    const project = projectManager.getProject(data.projectId);
    expect(project?.configuration.clientId).toBe(data.clientId);
    expect(typeof data.vsCodeOpened).toBe("boolean");
    expect(typeof data.vsCodeMessage).toBe("string");
    expect(data.vsCodeMessage.length).toBeGreaterThan(0);
  });

  it("rechaza category desconocida", async () => {
    const { api } = await buildApi();
    const response = await api.execute(
      makeRequest(
        "provisioning.create-project",
        { category: "no-existe", client: { name: "X" }, project: { name: "Y" } },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
    expect(response.success || response.error.code).toBe("APP_INVALID_PAYLOAD");
  });

  it("rechaza la petición si no hay ni existingClientId ni client", async () => {
    const { api } = await buildApi();
    const response = await api.execute(
      makeRequest(
        "provisioning.create-project",
        { category: "directo", project: { name: "Sin cliente" } },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
    expect(response.success || response.error.code).toBe("APP_INVALID_PAYLOAD");
  });

  it("falla con un mensaje claro si no hay ningún Sistema de Trabajo activo", async () => {
    const { api } = await buildApi({ withWorkspace: false });
    const response = await api.execute(
      makeRequest(
        "provisioning.create-project",
        { category: "directo", client: { name: "X" }, project: { name: "Y" } },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
    expect(response.success || response.error.category).toBe("not-found");
  });

  it("propaga el análisis de viabilidad como briefing-inicial.md real", async () => {
    const { api } = await buildApi();
    const response = await api.execute(
      makeRequest(
        "provisioning.create-project",
        {
          category: "viabilidad",
          client: { name: "Cliente Viable" },
          project: { name: "Proyecto Viable" },
          briefing: { veredicto: "Viable", riesgos: ["Plazo corto"] },
        },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    const data = response.data as { briefingGenerated: boolean; projectPath: string };
    expect(data.briefingGenerated).toBe(true);
    const briefing = await fs.readFile(path.join(data.projectPath, "briefing-inicial.md"), "utf-8");
    expect(briefing).toContain("Viable");
    expect(briefing).toContain("Plazo corto");
  });

  describe("provisioning.analyze-viability", () => {
    const baseProject = {
      projectName: "Portal de Clientes",
      descripcion: "Portal para gestionar solicitudes.",
      objetivo: "Reducir el tiempo de gestión manual.",
      presupuesto: "3.000 €",
      plazo: "1 mes",
      tecnologia: "WordPress",
      notas: "Diseño ya aprobado.",
    };

    it("usa el defaultAi del cliente (con secretReference real vía SecretsManager)", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { choices: [{ message: { content: JSON.stringify(VALID_REPORT) } }] })
        );
      const { api, clientManager, secretsManager } = await buildApi({ aiFetch: fetchImpl });
      await secretsManager.createSecret("ai.mci-finance.openai", "clave-real-de-mci");
      await clientManager.createClient({
        id: "mci-finance",
        name: "MCI Finance",
        slug: "mci-finance",
        defaultAi: {
          provider: "openai",
          model: "gpt-4o",
          secretReference: "ai.mci-finance.openai",
        },
      });

      const response = await api.execute(
        makeRequest(
          "provisioning.analyze-viability",
          { existingClientId: "mci-finance", project: baseProject },
          { caller: admin }
        )
      );

      expect(response.success).toBe(true);
      if (!response.success) return;
      const data = response.data as { veredicto: string; puntuacion: number; providerId: string };
      expect(data.veredicto).toBe("Viable");
      expect(data.puntuacion).toBe(80);
      expect(data.providerId).toBe("openai");
      expect(JSON.stringify(response.data)).not.toContain("clave-real-de-mci");
    });

    it("fallback global: sin cliente ni defaultAi, usa la IA global activa ya registrada", async () => {
      const { api, aiManager } = await buildApi();
      const sendRequest = vi.fn().mockResolvedValue({ content: JSON.stringify(VALID_REPORT) });
      aiManager.registerProvider(
        { id: "global", name: "global", sendRequest, healthCheck: async () => true },
        { setActive: true }
      );

      const response = await api.execute(
        makeRequest("provisioning.analyze-viability", { project: baseProject }, { caller: admin })
      );

      expect(response.success).toBe(true);
      expect(sendRequest).toHaveBeenCalledTimes(1);
    });

    it("usa fallbackModel si el modelo principal del cliente falla", async () => {
      let call = 0;
      const fetchImpl = vi.fn().mockImplementation(() => {
        call += 1;
        if (call === 1) return Promise.resolve(jsonResponse(500, { error: "sobrecargado" }));
        return Promise.resolve(
          jsonResponse(200, { choices: [{ message: { content: JSON.stringify(VALID_REPORT) } }] })
        );
      });
      const { api, clientManager, secretsManager } = await buildApi({ aiFetch: fetchImpl });
      await secretsManager.createSecret("ai.cliente.openai", "clave");
      await clientManager.createClient({
        id: "cliente",
        name: "Cliente",
        slug: "cliente",
        defaultAi: {
          provider: "openai",
          model: "modelo-caro",
          fallbackModel: "modelo-barato",
          secretReference: "ai.cliente.openai",
        },
      });

      const response = await api.execute(
        makeRequest(
          "provisioning.analyze-viability",
          { existingClientId: "cliente", project: baseProject },
          { caller: admin }
        )
      );

      expect(response.success).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("proveedor OpenAI-compatible: construye la petición con el formato OpenAI real", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { choices: [{ message: { content: JSON.stringify(VALID_REPORT) } }] })
        );
      const { api, clientManager, secretsManager } = await buildApi({ aiFetch: fetchImpl });
      await secretsManager.createSecret("ai.c.openai", "clave-openai");
      await clientManager.createClient({
        id: "c",
        name: "C",
        slug: "c",
        defaultAi: {
          provider: "openai",
          format: "openai",
          model: "gpt-4o",
          secretReference: "ai.c.openai",
        },
      });

      await api.execute(
        makeRequest(
          "provisioning.analyze-viability",
          { existingClientId: "c", project: baseProject },
          { caller: admin }
        )
      );

      const [url] = fetchImpl.mock.calls[0] as [string];
      expect(url).toContain("/chat/completions");
    });

    it("proveedor Anthropic: construye la petición con el formato Anthropic real", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { content: [{ type: "text", text: JSON.stringify(VALID_REPORT) }] })
        );
      const { api, clientManager, secretsManager } = await buildApi({ aiFetch: fetchImpl });
      await secretsManager.createSecret("ai.c.anthropic", "clave-anthropic");
      await clientManager.createClient({
        id: "c",
        name: "C",
        slug: "c",
        defaultAi: {
          provider: "anthropic",
          format: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          secretReference: "ai.c.anthropic",
        },
      });

      const response = await api.execute(
        makeRequest(
          "provisioning.analyze-viability",
          { existingClientId: "c", project: baseProject },
          { caller: admin }
        )
      );

      expect(response.success).toBe(true);
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/messages");
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe("clave-anthropic");
    });

    it("ausencia de configuración y sin proveedor global activo: falla con un mensaje claro, no simula un informe", async () => {
      const { api } = await buildApi();

      const response = await api.execute(
        makeRequest("provisioning.analyze-viability", { project: baseProject }, { caller: admin })
      );

      expect(response.success).toBe(false);
    });

    it("error del proveedor: se propaga como fallo real, nunca un informe inventado", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(500, { error: "fallo del proveedor" }));
      const { api, clientManager, secretsManager } = await buildApi({ aiFetch: fetchImpl });
      await secretsManager.createSecret("ai.c.openai", "clave");
      await clientManager.createClient({
        id: "c",
        name: "C",
        slug: "c",
        defaultAi: { provider: "openai", secretReference: "ai.c.openai" },
      });

      const response = await api.execute(
        makeRequest(
          "provisioning.analyze-viability",
          { existingClientId: "c", project: baseProject },
          { caller: admin }
        )
      );

      expect(response.success).toBe(false);
    });

    it("nunca expone el valor de la clave en la respuesta ni en el error", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { error: "no autorizado" }));
      const { api, clientManager, secretsManager } = await buildApi({ aiFetch: fetchImpl });
      await secretsManager.createSecret("ai.c.openai", "clave-ultra-secreta-9000");
      await clientManager.createClient({
        id: "c",
        name: "C",
        slug: "c",
        defaultAi: { provider: "openai", secretReference: "ai.c.openai" },
      });

      const response = await api.execute(
        makeRequest(
          "provisioning.analyze-viability",
          { existingClientId: "c", project: baseProject },
          { caller: admin }
        )
      );

      expect(JSON.stringify(response)).not.toContain("clave-ultra-secreta-9000");
    });

    it("nunca registra la clave en Actividad al generar (analizar) un informe", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { choices: [{ message: { content: JSON.stringify(VALID_REPORT) } }] })
        );
      const { api, clientManager, secretsManager } = await buildApi({ aiFetch: fetchImpl });
      await secretsManager.createSecret("ai.c.openai", "clave-de-actividad-9000");
      await clientManager.createClient({
        id: "c",
        name: "C",
        slug: "c",
        defaultAi: { provider: "openai", secretReference: "ai.c.openai" },
      });

      await api.execute(
        makeRequest(
          "provisioning.analyze-viability",
          { existingClientId: "c", project: baseProject },
          { caller: admin }
        )
      );

      // analyze-viability nunca escribe en el log de actividad por sí
      // mismo (solo lo hace la creación real del proyecto, ya probada
      // aparte); aquí se confirma explícitamente que no se ha filtrado
      // la clave a ningún sitio observable de la respuesta.
      const response = await api.execute(
        makeRequest("clients.activity", { id: "c" }, { caller: admin })
      );
      expect(JSON.stringify(response)).not.toContain("clave-de-actividad-9000");
    });
  });
});
