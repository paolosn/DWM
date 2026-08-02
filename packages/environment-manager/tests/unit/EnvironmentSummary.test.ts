import { describe, it, expect } from "vitest";
import { buildEnvironmentSummary } from "../../src/EnvironmentSummary.js";
import type { EnvironmentPlatformInfo, ToolResult } from "../../src/EnvironmentTypes.js";

const platformInfo: EnvironmentPlatformInfo = {
  platform: "linux",
  nodePlatform: "linux",
  architecture: "x64",
};

function tool(overrides: Partial<ToolResult>): ToolResult {
  return {
    id: "x",
    name: "X",
    category: "cli",
    status: "available",
    durationMs: 1,
    ...overrides,
  };
}

describe("buildEnvironmentSummary", () => {
  it("cuenta los estados de cada herramienta", () => {
    const tools: ToolResult[] = [
      tool({ id: "a", status: "available" }),
      tool({ id: "b", status: "missing" }),
      tool({ id: "c", status: "invalid", reason: "spawn-error" }),
      tool({ id: "d", status: "unsupported", reason: "unsupported-platform" }),
    ];
    const summary = buildEnvironmentSummary(platformInfo, tools, 42);
    expect(summary.availableCount).toBe(1);
    expect(summary.missingCount).toBe(1);
    expect(summary.invalidCount).toBe(1);
    expect(summary.unsupportedCount).toBe(1);
    expect(summary.durationMs).toBe(42);
    expect(typeof summary.generatedAt).toBe("string");
  });

  it("genera advertencias únicamente para herramientas inválidas", () => {
    const tools: ToolResult[] = [
      tool({ id: "a", status: "available" }),
      tool({ id: "b", status: "missing" }),
      tool({ id: "c", status: "invalid", reason: "timeout", name: "Roto" }),
    ];
    const summary = buildEnvironmentSummary(platformInfo, tools, 1);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings[0]).toMatchObject({ toolId: "c", code: "tool-invalid:c" });
  });

  it("deriva capacidades a partir de las herramientas disponibles", () => {
    const tools: ToolResult[] = [
      tool({ id: "docker", status: "available" }),
      tool({ id: "node", status: "missing" }),
      tool({ id: "python", status: "available" }),
      tool({ id: "php", status: "invalid", reason: "spawn-error" }),
    ];
    const summary = buildEnvironmentSummary(platformInfo, tools, 1);
    expect(summary.capabilities).toEqual({
      containerRuntime: true,
      nodeJavaScript: false,
      pythonRuntime: true,
      phpRuntime: false,
    });
  });

  it("con una lista vacía de herramientas, todos los contadores son 0 y no hay advertencias", () => {
    const summary = buildEnvironmentSummary(platformInfo, [], 0);
    expect(summary.availableCount).toBe(0);
    expect(summary.warnings).toEqual([]);
    expect(summary.capabilities).toEqual({
      containerRuntime: false,
      nodeJavaScript: false,
      pythonRuntime: false,
      phpRuntime: false,
    });
  });
});
