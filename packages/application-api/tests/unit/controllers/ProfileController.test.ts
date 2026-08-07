import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ProfileManager } from "@dwm/profile";
import { ProfileManager as RealProfileManager, defaultProfileConfiguration } from "@dwm/profile";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "configure"] as const };

function buildApi() {
  const fakeManager = {
    listProfiles: vi.fn().mockReturnValue(["p1"]),
    getProfile: vi.fn().mockReturnValue({ id: "p1" }),
    activateProfile: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProfileManager;

  return { api: new ApplicationAPI({ profileManager: fakeManager }), fakeManager };
}

describe("ProfileController", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-profile-ctrl-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  it("profiles.list y profiles.get delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("profiles.list", {}, { caller: admin }));
    expect(fakeManager.listProfiles).toHaveBeenCalled();

    await api.execute(makeRequest("profiles.get", { id: "p1" }, { caller: admin }));
    expect(fakeManager.getProfile).toHaveBeenCalledWith("p1");
  });

  it("profiles.activate delega en activateProfile", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("profiles.activate", { id: "p1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.activateProfile).toHaveBeenCalledWith("p1");
  });

  it("profiles.create crea un perfil real (kit de trabajo), reutilizando ProfileManager.createProfile", async () => {
    const profileManager = new RealProfileManager({ profilesDir: tempDir() });
    const api = new ApplicationAPI({ profileManager });

    const response = await api.execute(
      makeRequest(
        "profiles.create",
        {
          name: "Kit Backend",
          description: "Agentes/skills/reglas para proyectos backend.",
          configuration: {
            ...defaultProfileConfiguration(),
            color: "#4f46e5",
            agentIds: ["coordinador"],
            skillIds: ["checklist-produccion"],
            ruleIds: ["seguridad-codigo"],
            defaultAIProviderId: "openai",
          },
        },
        { caller: admin }
      )
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    const data = response.data as { id: string; configuration: { agentIds?: readonly string[] } };
    expect(data.configuration.agentIds).toEqual(["coordinador"]);

    const stored = profileManager.getProfile(data.id);
    expect(stored?.metadata.name).toBe("Kit Backend");
  });

  it("profiles.update edita un perfil real y devuelve el resultado actualizado", async () => {
    const profileManager = new RealProfileManager({ profilesDir: tempDir() });
    const created = await profileManager.createProfile(
      "Kit",
      "desc",
      defaultProfileConfiguration()
    );
    const api = new ApplicationAPI({ profileManager });

    const response = await api.execute(
      makeRequest(
        "profiles.update",
        {
          id: created.id,
          configuration: { ...defaultProfileConfiguration(), agentIds: ["coordinador"] },
        },
        { caller: admin }
      )
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    const data = response.data as { configuration: { agentIds?: readonly string[] } };
    expect(data.configuration.agentIds).toEqual(["coordinador"]);
  });

  it("profiles.duplicate reutiliza ProfileManager.cloneProfile real: nuevo id, mismo configuration/referencias, nombre '<original> (copia)', nunca valores de secretos", async () => {
    const profileManager = new RealProfileManager({ profilesDir: tempDir() });
    const source = await profileManager.createProfile("Kit Backend", "desc real", {
      ...defaultProfileConfiguration(),
      color: "#4f46e5",
      agentIds: ["coordinador"],
      skillIds: ["checklist-produccion"],
      ruleIds: ["seguridad-codigo"],
      mcpConnectionIds: ["mcp-1"],
      defaultAIProviderId: "openai",
      secretRefs: ["openai-api-key"],
    });
    const api = new ApplicationAPI({ profileManager });

    const response = await api.execute(
      makeRequest("profiles.duplicate", { id: source.id }, { caller: admin })
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    const duplicated = response.data as {
      id: string;
      metadata: { name: string };
      configuration: {
        agentIds?: readonly string[];
        skillIds?: readonly string[];
        ruleIds?: readonly string[];
        mcpConnectionIds?: readonly string[];
        secretRefs: readonly string[];
      };
    };

    // Nuevo id real, nunca el mismo que el original.
    expect(duplicated.id).not.toBe(source.id);
    // Nombre inicial exacto pedido.
    expect(duplicated.metadata.name).toBe("Kit Backend (copia)");
    // Configuración/referencias copiadas tal cual.
    expect(duplicated.configuration.agentIds).toEqual(["coordinador"]);
    expect(duplicated.configuration.skillIds).toEqual(["checklist-produccion"]);
    expect(duplicated.configuration.ruleIds).toEqual(["seguridad-codigo"]);
    expect(duplicated.configuration.mcpConnectionIds).toEqual(["mcp-1"]);
    // secretRefs son claves, no valores: se copian igual que el resto de la configuración real.
    expect(duplicated.configuration.secretRefs).toEqual(["openai-api-key"]);

    // El duplicado queda realmente independiente: editarlo no afecta al original.
    await profileManager.updateProfile(duplicated.id, {
      configuration: { ...defaultProfileConfiguration(), agentIds: ["otro-agente"] },
    });
    const originalStillIntact = profileManager.getProfile(source.id);
    expect(originalStillIntact?.configuration.agentIds).toEqual(["coordinador"]);
  });

  it("profiles.duplicate devuelve un error real si el perfil origen no existe", async () => {
    const profileManager = new RealProfileManager({ profilesDir: tempDir() });
    const api = new ApplicationAPI({ profileManager });

    const response = await api.execute(
      makeRequest("profiles.duplicate", { id: "no-existe" }, { caller: admin })
    );

    expect(response.success).toBe(false);
  });
});
