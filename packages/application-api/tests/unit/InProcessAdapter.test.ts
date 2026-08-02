import { describe, expect, it, vi } from "vitest";
import type { AgentManager } from "@dwm/agent-manager";
import { ApplicationAPI } from "../../src/ApplicationAPI.js";
import { InProcessAdapter } from "../../src/adapters/InProcessAdapter.js";

describe("InProcessAdapter", () => {
  it("genera un requestId y ejecuta la operación a través de ApplicationAPI", async () => {
    const fakeAgentManager = {
      listAgents: vi.fn().mockResolvedValue([]),
    } as unknown as AgentManager;
    const api = new ApplicationAPI({ agentManager: fakeAgentManager });
    const adapter = new InProcessAdapter(api);

    const response = await adapter.call(
      "agents.list",
      {},
      { caller: { grantedCapabilities: ["read"] } }
    );
    expect(response.success).toBe(true);
    expect(response.requestId).toBeTruthy();
  });

  it("propaga confirmación y metadata a la solicitud generada", async () => {
    const fakeAgentManager = {
      deleteAgent: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentManager;
    const api = new ApplicationAPI({ agentManager: fakeAgentManager });
    const adapter = new InProcessAdapter(api);

    const response = await adapter.call(
      "agents.delete",
      { id: "a1" },
      {
        caller: { grantedCapabilities: ["delete"] },
        confirmation: { confirmed: true },
        metadata: { source: "test" },
      }
    );
    expect(response.success).toBe(true);
  });
});
