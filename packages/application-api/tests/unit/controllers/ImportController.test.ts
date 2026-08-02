import { describe, expect, it, vi } from "vitest";
import type { ImportManager } from "@dwm/import-manager";
import type { PSNAdapter } from "@dwm/psn-adapter";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "import"] as const };

function buildApi(options: { withPsnAdapter?: boolean; psnScanFails?: boolean } = {}) {
  const scanResult = {
    entries: [],
    directories: [],
    fileCount: 0,
    directoryCount: 0,
    signature: "sig",
    scannedAt: Date.now(),
  };
  const importResult = {
    importId: "imp-1",
    state: "completed",
    dryRun: false,
    sourceType: "folder",
    sourcePath: "/tmp/source",
    destinationPath: "/tmp/workspace/source",
    filesImported: 3,
    directoriesImported: 1,
    warnings: [],
    errors: [],
  };
  const descriptor = {
    importId: "imp-1",
    request: { sourceType: "folder", sourcePath: "/tmp/source" },
    state: "completed",
    createdAt: new Date().toISOString(),
    filesImported: 3,
    directoriesImported: 1,
    warnings: [],
    errors: [],
  };

  const fakeManager = {
    scanSource: vi.fn().mockResolvedValue(scanResult),
    importSource: vi.fn().mockResolvedValue(importResult),
    getImport: vi.fn().mockReturnValue(descriptor),
    cancelImport: vi.fn().mockResolvedValue(undefined),
  } as unknown as ImportManager;

  const fakePsnAdapter = options.withPsnAdapter
    ? ({
        scanWorkspace: options.psnScanFails
          ? vi.fn().mockRejectedValue(new Error("psn boom"))
          : vi.fn().mockResolvedValue({ resources: [] }),
      } as unknown as PSNAdapter)
    : undefined;

  return {
    api: new ApplicationAPI({
      importManager: fakeManager,
      ...(fakePsnAdapter ? { psnAdapter: fakePsnAdapter } : {}),
    }),
    fakeManager,
    fakePsnAdapter,
    scanResult,
    importResult,
    descriptor,
  };
}

describe("ImportController", () => {
  it("import.inspect delega en scanSource sin escribir nada", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "import.inspect",
        { sourceType: "folder", sourcePath: "/tmp/source" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeManager.scanSource).toHaveBeenCalledWith({
      sourceType: "folder",
      sourcePath: "/tmp/source",
    });
  });

  it("rechaza sourceType inválido", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "import.inspect",
        { sourceType: "invalid", sourcePath: "/tmp/source" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
  });

  it("import.preview fuerza dryRun=true y delega en importSource", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "import.preview",
        { sourceType: "folder", sourcePath: "/tmp/source", dryRun: false },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeManager.importSource).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true })
    );
  });

  it("import.execute rechaza dryRun=true explícito", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: "/tmp/source", dryRun: true },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
  });

  it("import.execute delega en importSource y copia físicamente (vía manager)", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: "/tmp/source" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeManager.importSource).toHaveBeenCalledWith({
      sourceType: "folder",
      sourcePath: "/tmp/source",
    });
    expect(response.success && response.data).toMatchObject({ rescanned: false });
  });

  it("import.execute reescanea automáticamente con PSNAdapter cuando está disponible", async () => {
    const { api, fakePsnAdapter } = buildApi({ withPsnAdapter: true });
    const response = await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: "/tmp/source" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(response.success).toBe(true);
    expect(fakePsnAdapter!.scanWorkspace).toHaveBeenCalledWith("/tmp/workspace/source");
    expect(response.success && response.data).toMatchObject({ rescanned: true });
  });

  it("un fallo del reescaneo PSN no deshace ni oculta la importación ya completada", async () => {
    const { api } = buildApi({ withPsnAdapter: true, psnScanFails: true });
    const response = await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: "/tmp/source" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(response.success).toBe(true);
    expect(response.success && response.data).toMatchObject({
      state: "completed",
      rescanned: false,
    });
    expect(
      response.success && (response.data as { rescanWarning?: string }).rescanWarning
    ).toContain("psn boom");
  });

  it("import.execute rechaza sin confirmación explícita (operación destructiva)", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: "/tmp/source" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
  });

  it("import.status consulta el descriptor por id", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("import.status", { id: "imp-1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.getImport).toHaveBeenCalledWith("imp-1");
  });

  it("import.cancel delega la cancelación en el manager", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("import.cancel", { id: "imp-1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.cancelImport).toHaveBeenCalledWith("imp-1");
  });

  it("deniega import.execute sin la capacidad 'import'", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: "/tmp/source" },
        { caller: { grantedCapabilities: ["write"] as const } }
      )
    );
    expect(response.success).toBe(false);
  });
});
