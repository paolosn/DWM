import { describe, it, expect } from "vitest";
import { MigrationConflictDetector } from "../../src/MigrationConflict.js";

describe("MigrationConflictDetector", () => {
  it("sin ningún gestor integrado, no detecta conflictos", async () => {
    const detector = new MigrationConflictDetector();
    const conflicts = await detector.detect([{ resourceType: "project", resourceId: "p1" }]);
    expect(conflicts).toEqual([]);
  });

  it("detecta conflicto de config vía ConfigManager", async () => {
    const configManager = { hasSection: async (ns: string) => ns === "ns1" };
    const detector = new MigrationConflictDetector({ configManager: configManager as never });
    const conflicts = await detector.detect([
      { resourceType: "config", resourceId: "ns1" },
      { resourceType: "config", resourceId: "ns2" },
    ]);
    expect(conflicts).toEqual([{ resource: { resourceType: "config", resourceId: "ns1" } }]);
  });

  it("detecta conflictos de project/workspace/profile/plugin-metadata", async () => {
    const detector = new MigrationConflictDetector({
      projectManager: { getProject: (id: string) => (id === "p1" ? {} : undefined) } as never,
      workspaceManager: { getWorkspace: (id: string) => (id === "w1" ? {} : undefined) } as never,
      profileManager: { getProfile: (id: string) => (id === "pr1" ? {} : undefined) } as never,
      pluginManager: { getPlugin: (id: string) => (id === "pl1" ? {} : undefined) } as never,
    });
    const conflicts = await detector.detect([
      { resourceType: "project", resourceId: "p1" },
      { resourceType: "workspace", resourceId: "w1" },
      { resourceType: "profile", resourceId: "pr1" },
      { resourceType: "plugin-metadata", resourceId: "pl1" },
      { resourceType: "project", resourceId: "no-existe" },
    ]);
    expect(conflicts).toHaveLength(4);
  });

  it("secret-ref y custom nunca generan conflicto", async () => {
    const detector = new MigrationConflictDetector();
    const conflicts = await detector.detect([
      { resourceType: "secret-ref", resourceId: "k1" },
      { resourceType: "custom", resourceId: "c1" },
    ]);
    expect(conflicts).toEqual([]);
  });
});
