import { describe, expect, it, vi } from "vitest";
import type { DeliveryManager } from "@dwm/delivery-manager";
import type { Project, ProjectManager } from "@dwm/project";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = {
  grantedCapabilities: ["read", "write", "import", "archive"] as const,
};

function makeFakeProject(id: string, projectPath: string): Project {
  return {
    id,
    configuration: { projectPath, profileId: "profile-1", usedTools: [], usedAdapters: [] },
    metadata: { id, name: id, description: "", createdAt: "", updatedAt: "" },
    state: "created",
  } as unknown as Project;
}

function buildApi(
  options: { withProjectManager?: boolean; withDeliveryManager?: boolean } = {
    withProjectManager: true,
    withDeliveryManager: true,
  }
) {
  const delivery = {
    id: "delivery-1",
    projectId: "proyecto-1",
    folderName: "2026-08-01 Inicial",
    label: "Inicial",
    type: "folder",
    state: "active",
    origin: "/tmp/origen",
    hash: "abc123",
    sizeBytes: 100,
    fileCount: 3,
    directoryCount: 1,
    deliveredAt: "2026-08-01T00:00:00.000Z",
    importedAt: "2026-08-01T00:00:00.000Z",
    dwm: {
      archived: false,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    path: "/internal/data/projects/proyecto-1/ENTREGAS/2026-08-01 Inicial",
  };
  const summary = {
    id: delivery.id,
    folderName: delivery.folderName,
    label: delivery.label,
    type: delivery.type,
    state: delivery.state,
    hash: delivery.hash,
    sizeBytes: delivery.sizeBytes,
    deliveredAt: delivery.deliveredAt,
    importedAt: delivery.importedAt,
    active: true,
  };

  const fakeDeliveryManager = {
    listDeliveries: vi.fn().mockResolvedValue([summary]),
    getDelivery: vi.fn().mockResolvedValue(delivery),
    getActiveDelivery: vi.fn().mockResolvedValue(delivery),
    getHistory: vi.fn().mockResolvedValue([summary]),
    importDelivery: vi.fn().mockResolvedValue(delivery),
    compareDeliveries: vi.fn().mockResolvedValue({
      a: summary,
      b: summary,
      hashMatch: true,
      sizeDeltaBytes: 0,
      fileCountDelta: 0,
      directoryCountDelta: 0,
    }),
    verifyIntegrity: vi.fn().mockResolvedValue({
      valid: true,
      storedHash: delivery.hash,
      currentHash: delivery.hash,
      issues: [],
    }),
    archiveDelivery: vi.fn().mockResolvedValue({ ...delivery, state: "archived" }),
  } as unknown as DeliveryManager;

  const fakeProjectManager = {
    getProject: vi.fn((id: string) =>
      id === "proyecto-1" ? makeFakeProject("proyecto-1", "/data/projects/proyecto-1") : undefined
    ),
  } as unknown as ProjectManager;

  return {
    api: new ApplicationAPI({
      ...(options.withDeliveryManager !== false ? { deliveryManager: fakeDeliveryManager } : {}),
      ...(options.withProjectManager !== false ? { projectManager: fakeProjectManager } : {}),
    }),
    fakeDeliveryManager,
    fakeProjectManager,
    delivery,
    summary,
  };
}

describe("DeliveryController", () => {
  it("deliveries.list resuelve projectId -> projectPath y delega en listDeliveries", async () => {
    const { api, fakeDeliveryManager } = buildApi();
    const response = await api.execute(
      makeRequest("deliveries.list", { projectId: "proyecto-1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeDeliveryManager.listDeliveries).toHaveBeenCalledWith(
      "/data/projects/proyecto-1",
      {}
    );
  });

  it("deliveries.list acepta filtros de state/type/archived", async () => {
    const { api, fakeDeliveryManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "deliveries.list",
        { projectId: "proyecto-1", state: "active", type: "folder", archived: false },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeDeliveryManager.listDeliveries).toHaveBeenCalledWith("/data/projects/proyecto-1", {
      state: "active",
      type: "folder",
      archived: false,
    });
  });

  it("deliveries.list rechaza un state inválido con APP_INVALID_PAYLOAD", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "deliveries.list",
        { projectId: "proyecto-1", state: "no-existe" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
    expect(response.success || response.error.code).toBe("APP_INVALID_PAYLOAD");
  });

  it("deliveries.list falla con un proyecto inexistente (categoría not-found)", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest("deliveries.list", { projectId: "no-existe" }, { caller: admin })
    );
    expect(response.success).toBe(false);
    expect(response.success || response.error.category).toBe("not-found");
  });

  it("deliveries.get devuelve la entrega sin exponer la ruta física interna", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "deliveries.get",
        { projectId: "proyecto-1", id: "delivery-1" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    expect(response.success && response.data).not.toHaveProperty("path");
    expect(response.success && (response.data as { id: string }).id).toBe("delivery-1");
  });

  it("deliveries.get devuelve undefined cuando la entrega no existe", async () => {
    const { api, fakeDeliveryManager } = buildApi();
    (fakeDeliveryManager.getDelivery as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const response = await api.execute(
      makeRequest("deliveries.get", { projectId: "proyecto-1", id: "no-existe" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(response.success && response.data).toBeUndefined();
  });

  it("deliveries.get-active delega en getActiveDelivery sin exponer path", async () => {
    const { api, fakeDeliveryManager } = buildApi();
    const response = await api.execute(
      makeRequest("deliveries.get-active", { projectId: "proyecto-1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeDeliveryManager.getActiveDelivery).toHaveBeenCalledWith("/data/projects/proyecto-1");
    expect(response.success && response.data).not.toHaveProperty("path");
  });

  it("deliveries.history delega en getHistory", async () => {
    const { api, fakeDeliveryManager } = buildApi();
    const response = await api.execute(
      makeRequest("deliveries.history", { projectId: "proyecto-1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeDeliveryManager.getHistory).toHaveBeenCalledWith("/data/projects/proyecto-1");
  });

  it("deliveries.import resuelve projectPath y delega en importDelivery sin exponer path", async () => {
    const { api, fakeDeliveryManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "deliveries.import",
        {
          projectId: "proyecto-1",
          sourceType: "folder",
          sourcePath: "/tmp/origen",
          label: "Inicial",
        },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeDeliveryManager.importDelivery).toHaveBeenCalledWith({
      projectId: "proyecto-1",
      projectPath: "/data/projects/proyecto-1",
      sourceType: "folder",
      sourcePath: "/tmp/origen",
      label: "Inicial",
    });
    expect(response.success && response.data).not.toHaveProperty("path");
  });

  it("deliveries.import rechaza un sourceType inválido", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "deliveries.import",
        { projectId: "proyecto-1", sourceType: "dwm-workspace", sourcePath: "/tmp/x", label: "x" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
  });

  it("deliveries.import propaga campos opcionales (type, version, notes, deliveredAt)", async () => {
    const { api, fakeDeliveryManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "deliveries.import",
        {
          projectId: "proyecto-1",
          sourceType: "zip",
          sourcePath: "/tmp/origen.zip",
          label: "Corrección",
          type: "documentation",
          version: "1.0.2",
          notes: "todo ok",
          deliveredAt: "2026-08-15T00:00:00.000Z",
        },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeDeliveryManager.importDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "documentation",
        version: "1.0.2",
        notes: "todo ok",
        deliveredAt: "2026-08-15T00:00:00.000Z",
      })
    );
  });

  it("deliveries.compare delega en compareDeliveries con ambos ids", async () => {
    const { api, fakeDeliveryManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "deliveries.compare",
        { projectId: "proyecto-1", idA: "a", idB: "b" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeDeliveryManager.compareDeliveries).toHaveBeenCalledWith(
      "/data/projects/proyecto-1",
      "a",
      "b"
    );
  });

  it("deliveries.verify-integrity delega en verifyIntegrity", async () => {
    const { api, fakeDeliveryManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "deliveries.verify-integrity",
        { projectId: "proyecto-1", id: "delivery-1" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeDeliveryManager.verifyIntegrity).toHaveBeenCalledWith(
      "/data/projects/proyecto-1",
      "delivery-1"
    );
  });

  it("deliveries.archive exige confirmación explícita (operación destructiva)", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "deliveries.archive",
        { projectId: "proyecto-1", id: "delivery-1" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
  });

  it("deliveries.archive delega en archiveDelivery con confirmación y notas opcionales", async () => {
    const { api, fakeDeliveryManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "deliveries.archive",
        { projectId: "proyecto-1", id: "delivery-1", notes: "cerrada" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeDeliveryManager.archiveDelivery).toHaveBeenCalledWith(
      "/data/projects/proyecto-1",
      "delivery-1",
      { notes: "cerrada" }
    );
    expect(response.success && response.data).not.toHaveProperty("path");
  });

  it("deniega deliveries.archive sin la capacidad 'archive'", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "deliveries.archive",
        { projectId: "proyecto-1", id: "delivery-1" },
        {
          caller: { grantedCapabilities: ["read", "write"] as const },
          confirmation: { confirmed: true },
        }
      )
    );
    expect(response.success).toBe(false);
  });

  it("responde APP_DEPENDENCY_UNAVAILABLE si DeliveryManager no está conectado", async () => {
    const { api } = buildApi({ withDeliveryManager: false, withProjectManager: true });
    const response = await api.execute(
      makeRequest("deliveries.list", { projectId: "proyecto-1" }, { caller: admin })
    );
    expect(response.success).toBe(false);
    expect(response.success || response.error.code).toBe("APP_DEPENDENCY_UNAVAILABLE");
  });

  it("responde APP_DEPENDENCY_UNAVAILABLE si ProjectManager no está conectado", async () => {
    const { api } = buildApi({ withDeliveryManager: true, withProjectManager: false });
    const response = await api.execute(
      makeRequest("deliveries.list", { projectId: "proyecto-1" }, { caller: admin })
    );
    expect(response.success).toBe(false);
    expect(response.success || response.error.code).toBe("APP_DEPENDENCY_UNAVAILABLE");
  });
});
