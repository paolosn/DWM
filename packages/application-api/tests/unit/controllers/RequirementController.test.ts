import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { PortableWorkspaceManager } from "@dwm/portable-workspace";
import { RequirementManager } from "@dwm/requirement-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write"] as const };

describe("RequirementController — el requerimiento nunca queda flotante (feature/requirement-workflow, Commit 1)", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-requirement-ctrl-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function build() {
    const workspaceRoot = tempDir();
    const fakeWorkspaceManager = {
      getActiveWorkspace: vi
        .fn()
        .mockReturnValue({ root: workspaceRoot, metadata: {}, registeredAt: "" }),
    } as unknown as PortableWorkspaceManager;
    const requirementManager = new RequirementManager();
    const api = new ApplicationAPI({
      portableWorkspaceManager: fakeWorkspaceManager,
      requirementManager,
    });
    return { api, workspaceRoot };
  }

  it("crear requerimiento real y vincularlo a un proyecto real: nunca queda flotante tras 'Cliente acepta'", async () => {
    const { api } = build();

    const created = await api.execute(
      makeRequest(
        "requirements.create",
        {
          id: "web-inicial",
          title: "Crear web inicial",
          description: "Landing page real.",
          type: "desarrollo-directo",
          clientId: "acme",
        },
        { caller: admin }
      )
    );
    expect(created.success).toBe(true);
    expect(created.success && created.data.status).toBe("pending");

    const linked = await api.execute(
      makeRequest(
        "requirements.link-to-project",
        { id: "web-inicial", clientId: "acme", projectId: "proyecto-web-acme" },
        { caller: admin }
      )
    );
    expect(linked.success).toBe(true);
    expect(linked.success && linked.data.status).toBe("linked");
    expect(linked.success && linked.data.projectId).toBe("proyecto-web-acme");
  });

  it("un mismo proyecto acumula varios requerimientos reales en el tiempo, listados correctamente por requirements.list", async () => {
    const { api } = build();
    await api.execute(
      makeRequest(
        "requirements.create",
        { id: "r1", title: "Crear web inicial", description: "D", type: "t", clientId: "acme" },
        { caller: admin }
      )
    );
    await api.execute(
      makeRequest(
        "requirements.create",
        { id: "r2", title: "Añadir reservas", description: "D", type: "t", clientId: "acme" },
        { caller: admin }
      )
    );
    await api.execute(
      makeRequest(
        "requirements.link-to-project",
        { id: "r1", clientId: "acme", projectId: "proyecto-web-acme" },
        { caller: admin }
      )
    );
    await api.execute(
      makeRequest(
        "requirements.link-to-project",
        { id: "r2", clientId: "acme", projectId: "proyecto-web-acme" },
        { caller: admin }
      )
    );

    const response = await api.execute(
      makeRequest(
        "requirements.list",
        { clientId: "acme", projectId: "proyecto-web-acme" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    expect(response.success && response.data.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });
});
