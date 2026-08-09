import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read"] as const };

describe("*.get-folder-path — Abrir carpeta real de Agentes/Skills/Reglas (fix/kilo-open-folder)", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  const api = new ApplicationAPI({});

  it("agents.get-folder-path resuelve <root>/.kilo/agents y crea la carpeta si no existía (alcance global simulado)", async () => {
    const workspaceRoot = tempDir("dwm-global-");
    const response = await api.execute(
      makeRequest("agents.get-folder-path", { root: workspaceRoot }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    const expected = path.join(workspaceRoot, ".kilo", "agents");
    expect(response.data.path).toBe(expected);
    expect(existsSync(expected)).toBe(true);
  });

  it("skills.get-folder-path resuelve <root>/.kilo/skills (alcance cliente simulado: CLIENTES/<clientId>)", async () => {
    const workspaceRoot = tempDir("dwm-client-");
    const clientRoot = path.join(workspaceRoot, "CLIENTES", "mci-finance");
    const response = await api.execute(
      makeRequest("skills.get-folder-path", { root: clientRoot }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    const expected = path.join(clientRoot, ".kilo", "skills");
    expect(response.data.path).toBe(expected);
    expect(existsSync(expected)).toBe(true);
  });

  it("rules.get-folder-path resuelve <projectRoot>/.kilo/rules (alcance proyecto simulado)", async () => {
    const workspaceRoot = tempDir("dwm-project-");
    const projectRoot = path.join(workspaceRoot, "PROYECTOS", "portal");
    const response = await api.execute(
      makeRequest("rules.get-folder-path", { root: projectRoot }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    const expected = path.join(projectRoot, ".kilo", "rules");
    expect(response.data.path).toBe(expected);
    expect(existsSync(expected)).toBe(true);
  });

  it("rechaza path traversal real en root para los 3 tipos", async () => {
    for (const op of [
      "agents.get-folder-path",
      "skills.get-folder-path",
      "rules.get-folder-path",
    ] as const) {
      const response = await api.execute(makeRequest(op, { root: "../../etc" }, { caller: admin }));
      expect(response.success).toBe(false);
    }
  });

  it("es idempotente: llamarlo de nuevo sobre una carpeta ya existente sigue devolviendo la misma ruta real", async () => {
    const workspaceRoot = tempDir("dwm-idempotent-");
    const first = await api.execute(
      makeRequest("agents.get-folder-path", { root: workspaceRoot }, { caller: admin })
    );
    const second = await api.execute(
      makeRequest("agents.get-folder-path", { root: workspaceRoot }, { caller: admin })
    );
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.data.path).toBe(second.data.path);
    }
  });
});
