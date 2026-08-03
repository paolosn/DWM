import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { ClientManager } from "@dwm/client-manager";
import { ProjectManager } from "@dwm/project";
import { ProfileManager } from "@dwm/profile";
import { ProjectProvisioningService } from "@dwm/project-provisioning";
import { EnvironmentManager } from "@dwm/environment-manager";
import type { PortableWorkspaceManager, WorkspaceRegistryEntry } from "@dwm/portable-workspace";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write"] as const };

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

  async function buildApi(options: { withWorkspace?: boolean; withPsnBase?: boolean } = {}) {
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

    const api = new ApplicationAPI({
      projectProvisioningService,
      portableWorkspaceManager: fakeWorkspaceManager(workspace?.root),
      environmentManager,
    });

    return { api, clientManager, projectManager };
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
});
