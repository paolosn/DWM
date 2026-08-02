import { describe, expect, it, vi } from "vitest";
import type { ClientManager } from "@dwm/client-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "archive", "restore", "delete"] as const };

function buildApi() {
  const fakeManager = {
    listClients: vi.fn().mockResolvedValue([{ id: "c1" }]),
    getClient: vi.fn().mockResolvedValue({ id: "c1" }),
    createClient: vi.fn().mockResolvedValue({ id: "c1" }),
    updateClient: vi.fn().mockResolvedValue({ id: "c1" }),
    archiveClient: vi.fn().mockResolvedValue({ id: "c1" }),
    restoreClient: vi.fn().mockResolvedValue({ id: "c1" }),
    deleteClient: vi.fn().mockResolvedValue(undefined),
  } as unknown as ClientManager;

  return { api: new ApplicationAPI({ clientManager: fakeManager }), fakeManager };
}

describe("ClientController", () => {
  it("clients.list y clients.get delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("clients.list", {}, { caller: admin }));
    await api.execute(makeRequest("clients.get", { id: "c1" }, { caller: admin }));
    expect(fakeManager.getClient).toHaveBeenCalledWith("c1", undefined);
  });

  it("clients.create incluye campos opcionales solo si se proporcionan", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(
      makeRequest(
        "clients.create",
        { id: "c1", name: "Cliente", slug: "cliente", tags: ["vip"], description: "desc" },
        { caller: admin }
      )
    );
    expect(fakeManager.createClient).toHaveBeenCalledWith(
      { id: "c1", name: "Cliente", slug: "cliente", tags: ["vip"], description: "desc" },
      undefined
    );

    await api.execute(
      makeRequest("clients.create", { id: "c2", name: "N", slug: "n" }, { caller: admin })
    );
    expect(fakeManager.createClient).toHaveBeenCalledWith(
      { id: "c2", name: "N", slug: "n" },
      undefined
    );
  });

  it("clients.update solo envía los campos indicados", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(
      makeRequest("clients.update", { id: "c1", name: "Nuevo" }, { caller: admin })
    );
    expect(fakeManager.updateClient).toHaveBeenCalledWith("c1", { name: "Nuevo" }, undefined);
  });

  it("clients.archive y clients.restore delegan correctamente", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("clients.archive", { id: "c1" }, { caller: admin }));
    expect(fakeManager.archiveClient).toHaveBeenCalledWith("c1", undefined);
    await api.execute(makeRequest("clients.restore", { id: "c1" }, { caller: admin }));
    expect(fakeManager.restoreClient).toHaveBeenCalledWith("c1", undefined);
  });

  it("clients.delete exige confirmación explícita", async () => {
    const { api, fakeManager } = buildApi();
    const denied = await api.execute(
      makeRequest("clients.delete", { id: "c1" }, { caller: admin })
    );
    expect(denied.success).toBe(false);

    const ok = await api.execute(
      makeRequest(
        "clients.delete",
        { id: "c1" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(ok.success).toBe(true);
    expect(fakeManager.deleteClient).toHaveBeenCalledWith(
      "c1",
      { confirmPermanent: true },
      undefined
    );
  });
});
