import { describe, it, expect, vi } from "vitest";
import { GitHubConnectionAdapter } from "../../../src/adapters/GitHubConnectionAdapter.js";
import { ConnectionErrorCode } from "../../../src/errors/ConnectionErrorCode.js";
import type { Connection } from "../../../src/ConnectionTypes.js";

function makeConnection(): Connection {
  return {
    id: "conn-gh",
    projectId: "proj-1",
    name: "GitHub main",
    type: "github",
    profileIds: [],
    status: "unconfigured",
    enabled: true,
    capabilities: [],
    secretReferences: {},
    config: {},
    adapterId: "github",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestAt: null,
    lastSuccessfulTestAt: null,
    lastError: null,
    metadata: { dwm: {} },
  };
}

describe("GitHubConnectionAdapter", () => {
  it("sin token resuelto, lanza CONNECTION_SECRET_MISSING sin llamar a fetch", async () => {
    const fetchImpl = vi.fn();
    const adapter = new GitHubConnectionAdapter(fetchImpl as unknown as typeof fetch);
    await expect(
      adapter.test({
        connection: makeConnection(),
        resolvedSecrets: {},
        timeoutMs: 1000,
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: ConnectionErrorCode.CONNECTION_SECRET_MISSING });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("test() con token válido reporta éxito y expone los scopes como capacidades", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name === "x-oauth-scopes" ? "repo, workflow" : null) },
    });
    const adapter = new GitHubConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: { token: "ghp_valorsecreto" },
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(true);
    expect(result.capabilitiesDetected).toEqual(["repo", "workflow"]);
  });

  it("nunca hace más de una llamada real por prueba (sin llamadas destructivas)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "" },
    });
    const adapter = new GitHubConnectionAdapter(fetchImpl as unknown as typeof fetch);
    await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: { token: "ghp_x" },
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toContain("/user");
  });

  it("una excepción de red se reporta como fallo seguro, sin propagar la excepción cruda", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down for ghp_secreto"));
    const adapter = new GitHubConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: { token: "ghp_secreto" },
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).not.toContain("ghp_secreto");
  });
});
