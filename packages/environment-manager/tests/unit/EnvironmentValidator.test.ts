import { describe, it, expect } from "vitest";
import { EnvironmentValidator } from "../../src/EnvironmentValidator.js";
import type { ToolResult } from "../../src/EnvironmentTypes.js";

function tool(overrides: Partial<ToolResult>): ToolResult {
  return { id: "x", name: "X", category: "cli", status: "available", durationMs: 1, ...overrides };
}

describe("EnvironmentValidator", () => {
  const validator = new EnvironmentValidator();

  it("satisfecho cuando la herramienta está disponible y sin versión mínima exigida", () => {
    const tools = [tool({ id: "git", status: "available" })];
    const result = validator.validate([{ toolId: "git" }], tools);
    expect(result.valid).toBe(true);
    expect(result.results[0]).toMatchObject({ toolId: "git", satisfied: true, required: true });
  });

  it("satisfecho cuando la versión detectada cumple la mínima", () => {
    const tools = [
      tool({ id: "node", version: { raw: "20.11.0", major: 20, minor: 11, patch: 0 } }),
    ];
    const result = validator.validate([{ toolId: "node", minVersion: "18.0.0" }], tools);
    expect(result.valid).toBe(true);
    expect(result.results[0]).toMatchObject({ satisfied: true, foundVersion: "20.11.0" });
  });

  it("no satisfecho cuando la versión detectada está por debajo de la mínima", () => {
    const tools = [tool({ id: "node", version: { raw: "16.2.0", major: 16, minor: 2, patch: 0 } })];
    const result = validator.validate([{ toolId: "node", minVersion: "18.0.0" }], tools);
    expect(result.valid).toBe(false);
    expect(result.results[0]?.satisfied).toBe(false);
    expect(result.results[0]?.message).toContain("por debajo de la mínima");
  });

  it("no satisfecho cuando la herramienta falta y es obligatoria (por defecto)", () => {
    const result = validator.validate([{ toolId: "docker" }], []);
    expect(result.valid).toBe(false);
    expect(result.results[0]).toMatchObject({
      toolId: "docker",
      satisfied: false,
      status: "missing",
    });
  });

  it("no bloquea la validación global cuando el requisito ausente no es obligatorio", () => {
    const result = validator.validate([{ toolId: "docker", required: false }], []);
    expect(result.valid).toBe(true);
    expect(result.results[0]?.satisfied).toBe(false);
    expect(result.results[0]?.required).toBe(false);
  });

  it("no satisfecho cuando la herramienta está detectada pero no ejecutable", () => {
    const tools = [tool({ id: "git", status: "invalid", reason: "spawn-error" })];
    const result = validator.validate([{ toolId: "git" }], tools);
    expect(result.valid).toBe(false);
    expect(result.results[0]).toMatchObject({ satisfied: false, status: "invalid" });
  });

  it("valida múltiples requisitos, algunos obligatorios y otros no", () => {
    const tools = [
      tool({ id: "git", status: "available" }),
      tool({ id: "docker", status: "missing" }),
    ];
    const result = validator.validate(
      [{ toolId: "git" }, { toolId: "docker", required: false }],
      tools
    );
    expect(result.valid).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  it("con lista de requisitos vacía, siempre es válido", () => {
    expect(validator.validate([], [])).toEqual({ valid: true, results: [] });
  });
});
