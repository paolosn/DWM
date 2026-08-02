import { describe, it, expect } from "vitest";
import { EnvironmentRegistry } from "../../src/EnvironmentRegistry.js";
import { buildEnvironmentSummary } from "../../src/EnvironmentSummary.js";
import type { EnvironmentPlatformInfo, ToolResult } from "../../src/EnvironmentTypes.js";

const platformInfo: EnvironmentPlatformInfo = {
  platform: "linux",
  nodePlatform: "linux",
  architecture: "x64",
};

function tool(overrides: Partial<ToolResult>): ToolResult {
  return { id: "x", name: "X", category: "cli", status: "available", durationMs: 1, ...overrides };
}

describe("EnvironmentRegistry", () => {
  it("no tiene caché hasta que se llama a set()", () => {
    const registry = new EnvironmentRegistry();
    expect(registry.hasCache()).toBe(false);
    expect(registry.get()).toBeUndefined();
    expect(registry.getTool("a")).toBeUndefined();
  });

  it("set() cachea el resumen y permite consultar herramientas individuales por id", () => {
    const registry = new EnvironmentRegistry();
    const summary = buildEnvironmentSummary(platformInfo, [tool({ id: "git" })], 5);
    registry.set(summary);

    expect(registry.hasCache()).toBe(true);
    expect(registry.get()).toBe(summary);
    expect(registry.getTool("git")?.id).toBe("git");
    expect(registry.getTool("no-existe")).toBeUndefined();
  });

  it("invalidate() vacía la caché por completo", () => {
    const registry = new EnvironmentRegistry();
    registry.set(buildEnvironmentSummary(platformInfo, [tool({ id: "git" })], 1));
    registry.invalidate();
    expect(registry.hasCache()).toBe(false);
    expect(registry.get()).toBeUndefined();
    expect(registry.getTool("git")).toBeUndefined();
  });

  it("set() sustituye por completo la caché anterior (no la combina)", () => {
    const registry = new EnvironmentRegistry();
    registry.set(buildEnvironmentSummary(platformInfo, [tool({ id: "a" })], 1));
    registry.set(buildEnvironmentSummary(platformInfo, [tool({ id: "b" })], 2));
    expect(registry.getTool("a")).toBeUndefined();
    expect(registry.getTool("b")?.id).toBe("b");
  });
});
