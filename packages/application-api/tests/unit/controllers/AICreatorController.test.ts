import { describe, expect, it, vi } from "vitest";
import type { AICreatorManager } from "@dwm/ai-creator-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write"] as const };

function buildApi() {
  const fakeManager = {
    previewCreation: vi.fn().mockResolvedValue({ ok: true }),
    create: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as AICreatorManager;

  return { api: new ApplicationAPI({ aiCreatorManager: fakeManager }), fakeManager };
}

const creationRequest = { kind: "agent", payload: { id: "a1", data: { name: "x" } } };

describe("AICreatorController", () => {
  it("ai.preview delega en previewCreation con request/options", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("ai.preview", { request: creationRequest }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.previewCreation).toHaveBeenCalledWith(creationRequest, {});
  });

  it("ai.preview propaga options.root cuando se indica", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(
      makeRequest(
        "ai.preview",
        { request: creationRequest, options: { root: "/ws" } },
        { caller: admin }
      )
    );
    expect(fakeManager.previewCreation).toHaveBeenCalledWith(creationRequest, { root: "/ws" });
  });

  it("ai.create es una operación larga que delega en create", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("ai.create", { request: creationRequest }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.create).toHaveBeenCalledWith(creationRequest, {});
  });

  it("rechaza un CreationRequest sin kind válido", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest("ai.preview", { request: { kind: "no-existe", payload: {} } }, { caller: admin })
    );
    expect(response.success).toBe(false);
  });

  it("rechaza un CreationRequest sin payload", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest("ai.preview", { request: { kind: "agent" } }, { caller: admin })
    );
    expect(response.success).toBe(false);
  });
});
