import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AgentManager } from "@dwm/agent-manager";
import { SkillManager } from "@dwm/skill-manager";
import { RuleManager } from "@dwm/rule-manager";
import { AIManager } from "@dwm/ai-manager";
import { SecretsManager } from "@dwm/secrets";
import { ContentGenerationService } from "../../src/ContentGenerationService.js";
import { ProjectProvisioningErrorCode } from "../../src/errors/ProjectProvisioningErrorCode.js";

const BASE_AI_CONFIG = { timeoutMs: 2000, retry: { maxAttempts: 1, backoff: { baseDelayMs: 5 } } };

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

const REAL_SKILL_MARKDOWN = `---
name: checklist-produccion
description: Verificar que todo está listo antes de pasar a producción.
---

# Skill — Checklist de Producción

- [ ] HTTPS activo
- [ ] Backups configurados
`;

const REAL_RULE_MARKDOWN = `# Un cambio a la vez

Nunca hacer múltiples cambios simultáneos sin verificar cada uno.
`;

describe("ContentGenerationService", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-content-gen-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  async function makeRoot(): Promise<string> {
    const root = tempDir();
    await fs.mkdir(path.join(root, ".kilo", "agents"), { recursive: true });
    await fs.mkdir(path.join(root, ".kilo", "skills"), { recursive: true });
    await fs.mkdir(path.join(root, ".kilo", "rules"), { recursive: true });
    await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
    return root;
  }

  async function buildEnv(secrets: Record<string, string> = {}) {
    const secretsDir = tempDir();
    const secretsManager = new SecretsManager({
      configuration: { secretsDir, masterKey: "clave-maestra-content-gen-tests" },
    });
    for (const [key, value] of Object.entries(secrets)) {
      await secretsManager.createSecret(key, value);
    }
    const aiManager = new AIManager({ configuration: BASE_AI_CONFIG, secretsManager });
    const psnAdapter = new PSNAdapter();
    const agentManager = new AgentManager({ psnAdapter });
    const skillManager = new SkillManager({ psnAdapter });
    const ruleManager = new RuleManager({ psnAdapter });
    return { aiManager, agentManager, skillManager, ruleManager, psnAdapter };
  }

  it("genera un agente real con IA y lo escribe directamente como .kilo/agents/<id>.md, sin JSON intermedio", async () => {
    const { aiManager, agentManager, skillManager, ruleManager, psnAdapter } = await buildEnv({
      "ai.secret": "clave-real",
    });
    const root = await makeRoot();
    await psnAdapter.scanWorkspace(root);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: REAL_AGENT_MARKDOWN } }] })
      );
    const service = new ContentGenerationService(
      aiManager,
      agentManager,
      skillManager,
      ruleManager,
      fetchImpl
    );

    const result = await service.generateAndWrite(
      "agent",
      { provider: "openai", model: "gpt-4o", secretReference: "ai.secret" },
      { id: "experto-mysql", instructions: "Crea un agente experto en MySQL." },
      root
    );

    expect(result.content).toContain("# Experto en MySQL");
    expect(result.providerId).toBe("openai");

    const raw = await fs.readFile(path.join(root, ".kilo", "agents", "experto-mysql.md"), "utf-8");
    expect(raw).toContain("# Experto en MySQL");
    expect(raw).toContain('color: "#4479a1"');
    // Nunca se ha intentado interpretar la respuesta como JSON en ningún punto.
    expect(() => JSON.parse(raw)).toThrow();
  });

  it("genera una skill real y la escribe como .kilo/skills/<id>/SKILL.md", async () => {
    const { aiManager, agentManager, skillManager, ruleManager, psnAdapter } = await buildEnv({
      "ai.secret": "clave-real",
    });
    const root = await makeRoot();
    await psnAdapter.scanWorkspace(root);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: REAL_SKILL_MARKDOWN } }] })
      );
    const service = new ContentGenerationService(
      aiManager,
      agentManager,
      skillManager,
      ruleManager,
      fetchImpl
    );

    await service.generateAndWrite(
      "skill",
      { provider: "openai", secretReference: "ai.secret" },
      { id: "checklist-produccion", instructions: "Checklist antes de producción." },
      root
    );

    const raw = await fs.readFile(
      path.join(root, ".kilo", "skills", "checklist-produccion", "SKILL.md"),
      "utf-8"
    );
    expect(raw).toContain("name: checklist-produccion");
    expect(raw).toContain("- [ ] HTTPS activo");
  });

  it("genera una regla real y la escribe como .kilo/rules/<id>.md", async () => {
    const { aiManager, agentManager, skillManager, ruleManager, psnAdapter } = await buildEnv({
      "ai.secret": "clave-real",
    });
    const root = await makeRoot();
    await psnAdapter.scanWorkspace(root);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: REAL_RULE_MARKDOWN } }] })
      );
    const service = new ContentGenerationService(
      aiManager,
      agentManager,
      skillManager,
      ruleManager,
      fetchImpl
    );

    await service.generateAndWrite(
      "rule",
      { provider: "openai", secretReference: "ai.secret" },
      { id: "un-cambio-a-la-vez", instructions: "Regla sobre hacer un cambio cada vez." },
      root
    );

    const raw = await fs.readFile(
      path.join(root, ".kilo", "rules", "un-cambio-a-la-vez.md"),
      "utf-8"
    );
    expect(raw).toContain("# Un cambio a la vez");
  });

  it("tolera que la IA envuelva la respuesta en un bloque ```markdown pese a la instrucción de no hacerlo", async () => {
    const { aiManager, agentManager, skillManager, ruleManager, psnAdapter } = await buildEnv({
      "ai.secret": "clave",
    });
    const root = await makeRoot();
    await psnAdapter.scanWorkspace(root);
    const wrapped = `Aquí tienes el agente:\n\`\`\`markdown\n${REAL_AGENT_MARKDOWN}\`\`\``;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: wrapped } }] }));
    const service = new ContentGenerationService(
      aiManager,
      agentManager,
      skillManager,
      ruleManager,
      fetchImpl
    );

    const result = await service.generateAndWrite(
      "agent",
      { provider: "openai", secretReference: "ai.secret" },
      { id: "experto-mysql", instructions: "x" },
      root
    );
    expect(result.content).toContain("# Experto en MySQL");
    expect(result.content).not.toContain("```");
  });

  it("actualiza (no duplica) si ya existe un agente con ese id", async () => {
    const { aiManager, agentManager, skillManager, ruleManager, psnAdapter } = await buildEnv({
      "ai.secret": "clave",
    });
    const root = await makeRoot();
    await psnAdapter.scanWorkspace(root);
    await agentManager.createAgent({ id: "experto-mysql", content: "# Versión anterior\n" }, root);

    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: REAL_AGENT_MARKDOWN } }] })
      );
    const service = new ContentGenerationService(
      aiManager,
      agentManager,
      skillManager,
      ruleManager,
      fetchImpl
    );
    await service.generateAndWrite(
      "agent",
      { provider: "openai", secretReference: "ai.secret" },
      { id: "experto-mysql", instructions: "x" },
      root
    );

    const raw = await fs.readFile(path.join(root, ".kilo", "agents", "experto-mysql.md"), "utf-8");
    expect(raw).toContain("# Experto en MySQL");
    expect(raw).not.toContain("Versión anterior");
  });

  it("usa fallbackModel si el modelo principal falla", async () => {
    const { aiManager, agentManager, skillManager, ruleManager, psnAdapter } = await buildEnv({
      "ai.secret": "clave",
    });
    const root = await makeRoot();
    await psnAdapter.scanWorkspace(root);
    let call = 0;
    const fetchImpl = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(jsonResponse(500, { error: "sobrecargado" }));
      return Promise.resolve(
        jsonResponse(200, { choices: [{ message: { content: REAL_AGENT_MARKDOWN } }] })
      );
    });
    const service = new ContentGenerationService(
      aiManager,
      agentManager,
      skillManager,
      ruleManager,
      fetchImpl
    );

    const result = await service.generateAndWrite(
      "agent",
      {
        provider: "openai",
        model: "modelo-caro",
        fallbackModel: "modelo-barato",
        secretReference: "ai.secret",
      },
      { id: "experto-mysql", instructions: "x" },
      root
    );
    expect(result.content).toContain("# Experto en MySQL");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("respuesta vacía de la IA: falla en vez de escribir un fichero vacío", async () => {
    const { aiManager, agentManager, skillManager, ruleManager, psnAdapter } = await buildEnv({
      "ai.secret": "clave",
    });
    const root = await makeRoot();
    await psnAdapter.scanWorkspace(root);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "   " } }] }));
    const service = new ContentGenerationService(
      aiManager,
      agentManager,
      skillManager,
      ruleManager,
      fetchImpl
    );

    await expect(
      service.generateAndWrite(
        "agent",
        { provider: "openai", secretReference: "ai.secret" },
        { id: "experto-mysql", instructions: "x" },
        root
      )
    ).rejects.toMatchObject({ code: ProjectProvisioningErrorCode.PROVISIONING_AI_FAILED });

    await expect(
      fs.access(path.join(root, ".kilo", "agents", "experto-mysql.md"))
    ).rejects.toThrow();
  });

  it("nunca duplica el registro de un proveedor ya registrado", async () => {
    const { aiManager, agentManager, skillManager, ruleManager, psnAdapter } = await buildEnv({
      "ai.secret": "clave",
    });
    const root = await makeRoot();
    await psnAdapter.scanWorkspace(root);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: REAL_AGENT_MARKDOWN } }] })
      );
    const service = new ContentGenerationService(
      aiManager,
      agentManager,
      skillManager,
      ruleManager,
      fetchImpl
    );

    await service.generateAndWrite(
      "agent",
      { provider: "openai", secretReference: "ai.secret" },
      { id: "a1", instructions: "x" },
      root
    );
    await service.generateAndWrite(
      "agent",
      { provider: "openai", secretReference: "ai.secret" },
      { id: "a2", instructions: "y" },
      root
    );

    expect(aiManager.listProviders()).toEqual(["openai"]);
  });

  it("proveedor Anthropic real: usa el formato Anthropic Messages", async () => {
    const { aiManager, agentManager, skillManager, ruleManager, psnAdapter } = await buildEnv({
      "ai.secret": "clave-anthropic",
    });
    const root = await makeRoot();
    await psnAdapter.scanWorkspace(root);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { content: [{ type: "text", text: REAL_AGENT_MARKDOWN }] })
      );
    const service = new ContentGenerationService(
      aiManager,
      agentManager,
      skillManager,
      ruleManager,
      fetchImpl
    );

    const result = await service.generateAndWrite(
      "agent",
      { provider: "anthropic", format: "anthropic", secretReference: "ai.secret" },
      { id: "experto-mysql", instructions: "x" },
      root
    );
    expect(result.content).toContain("# Experto en MySQL");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("clave-anthropic");
  });
});
