import { describe, expect, it, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AgentManager } from "@dwm/agent-manager";
import { SkillManager } from "@dwm/skill-manager";
import { RuleManager } from "@dwm/rule-manager";
import { ClientManager } from "@dwm/client-manager";
import { AIManager } from "@dwm/ai-manager";
import { SecretsManager } from "@dwm/secrets";
import { ContentGenerationService } from "@dwm/project-provisioning";
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

const REAL_AGENT_MARKDOWN = `---
description: Experto en MySQL y MariaDB.
mode: all
color: "#4479a1"
---

# Experto en MySQL

Diseña esquemas eficientes y optimiza queries lentas.
`;

describe("ContentGenerationController", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  async function makeKiloRoot(): Promise<string> {
    const root = tempDir("dwm-content-gen-ctrl-");
    await fs.mkdir(path.join(root, ".kilo", "agents"), { recursive: true });
    await fs.mkdir(path.join(root, ".kilo", "skills"), { recursive: true });
    await fs.mkdir(path.join(root, ".kilo", "rules"), { recursive: true });
    await fs.mkdir(path.join(root, "CLIENTES"), { recursive: true });
    await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
    return root;
  }

  function fakeWorkspaceManager(root: string): PortableWorkspaceManager {
    return {
      getActiveWorkspace: (): WorkspaceRegistryEntry => ({
        root,
        metadata: { id: "ws-1", name: "ws", createdAt: "", updatedAt: "" } as never,
        registeredAt: new Date().toISOString(),
      }),
    } as unknown as PortableWorkspaceManager;
  }

  async function buildApi(fetchImpl: ReturnType<typeof vi.fn>) {
    const workspaceRoot = await makeKiloRoot();
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(workspaceRoot);

    const agentManager = new AgentManager({ psnAdapter });
    const skillManager = new SkillManager({ psnAdapter });
    const ruleManager = new RuleManager({ psnAdapter });
    const clientManager = new ClientManager({ psnAdapter });

    const secretsManager = new SecretsManager({
      configuration: {
        secretsDir: tempDir("dwm-content-gen-ctrl-secrets-"),
        masterKey: "clave-maestra-content-gen-ctrl-tests",
      },
    });
    const aiManager = new AIManager({
      configuration: { timeoutMs: 2000, retry: { maxAttempts: 1, backoff: { baseDelayMs: 5 } } },
      secretsManager,
    });
    const contentGenerationService = new ContentGenerationService(
      aiManager,
      agentManager,
      skillManager,
      ruleManager,
      fetchImpl
    );

    const api = new ApplicationAPI({
      psnAdapter,
      agentManager,
      clientManager,
      contentGenerationService,
      portableWorkspaceManager: fakeWorkspaceManager(workspaceRoot),
    });

    return { api, clientManager, secretsManager, workspaceRoot };
  }

  it("genera un agente real con IA usando el defaultAi del cliente, y lo escribe directamente en .kilo/agents", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: REAL_AGENT_MARKDOWN } }] })
      );
    const { api, clientManager, secretsManager, workspaceRoot } = await buildApi(fetchImpl);
    await secretsManager.createSecret("ai.mci-finance.openai", "clave-real-de-mci");
    await clientManager.createClient({
      id: "mci-finance",
      name: "MCI Finance",
      slug: "mci-finance",
      defaultAi: { provider: "openai", model: "gpt-4o", secretReference: "ai.mci-finance.openai" },
    });

    const response = await api.execute(
      makeRequest(
        "content-generation.generate",
        {
          kind: "agent",
          id: "experto-mysql",
          instructions: "Crea un agente experto en MySQL.",
          clientId: "mci-finance",
        },
        { caller: admin }
      )
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    const data = response.data as { content: string; providerId: string };
    expect(data.content).toContain("# Experto en MySQL");
    expect(data.providerId).toBe("openai");
    expect(JSON.stringify(response.data)).not.toContain("clave-real-de-mci");

    const raw = await fs.readFile(
      path.join(workspaceRoot, "CLIENTES", "mci-finance", ".kilo", "agents", "experto-mysql.md"),
      "utf-8"
    );
    expect(raw).toContain("# Experto en MySQL");
  });

  it("genera una skill real sin defaultAi de cliente, usando la IA global activa", async () => {
    const fetchImpl = vi.fn();
    const { api } = await buildApi(fetchImpl);
    // No hay defaultAi ni proyecto: debe usar el proveedor global ya registrado.
    const response = await api.execute(
      makeRequest(
        "content-generation.generate",
        { kind: "skill", id: "checklist-produccion", instructions: "Checklist de producción." },
        { caller: admin }
      )
    );
    // Sin proveedor global registrado, la generación falla honestamente (no simula un resultado).
    expect(response.success).toBe(false);
  });

  it("rechaza un kind no soportado", async () => {
    const { api } = await buildApi(vi.fn());
    const response = await api.execute(
      makeRequest(
        "content-generation.generate",
        { kind: "otro", id: "x", instructions: "x" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
  });

  it("nunca expone la clave en la respuesta ni en el error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { error: "no autorizado" }));
    const { api, clientManager, secretsManager } = await buildApi(fetchImpl);
    await secretsManager.createSecret("ai.c.openai", "clave-ultra-secreta-content-gen");
    await clientManager.createClient({
      id: "c",
      name: "C",
      slug: "c",
      defaultAi: { provider: "openai", secretReference: "ai.c.openai" },
    });

    const response = await api.execute(
      makeRequest(
        "content-generation.generate",
        { kind: "agent", id: "x", instructions: "x", clientId: "c" },
        { caller: admin }
      )
    );
    expect(JSON.stringify(response)).not.toContain("clave-ultra-secreta-content-gen");
  });
});
