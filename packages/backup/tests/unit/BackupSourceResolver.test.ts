import { describe, it, expect } from "vitest";
import { ManagedBackupSourceResolver } from "../../src/BackupSourceResolver.js";

describe("ManagedBackupSourceResolver", () => {
  it("sin ningún gestor integrado, asume que el recurso existe (sin instantánea)", async () => {
    const resolver = new ManagedBackupSourceResolver();
    const result = await resolver.resolve({ resourceType: "project", resourceId: "p1" });
    expect(result).toEqual({
      resource: { resourceType: "project", resourceId: "p1" },
      exists: true,
    });
  });

  it("resuelve un proyecto existente/inexistente a través de ProjectManager", async () => {
    const projectManager = {
      getProject: (id: string) =>
        id === "p1" ? { metadata: { id }, configuration: {} } : undefined,
    };
    const resolver = new ManagedBackupSourceResolver({ projectManager: projectManager as never });
    const found = await resolver.resolve({ resourceType: "project", resourceId: "p1" });
    expect(found.exists).toBe(true);
    expect(found.snapshot).toBeDefined();
    const missing = await resolver.resolve({ resourceType: "project", resourceId: "no-existe" });
    expect(missing.exists).toBe(false);
  });

  it("resuelve un workspace a través de WorkspaceManager", async () => {
    const workspaceManager = {
      getWorkspace: (id: string) => (id === "w1" ? { metadata: { id } } : undefined),
    };
    const resolver = new ManagedBackupSourceResolver({
      workspaceManager: workspaceManager as never,
    });
    expect((await resolver.resolve({ resourceType: "workspace", resourceId: "w1" })).exists).toBe(
      true
    );
    expect((await resolver.resolve({ resourceType: "workspace", resourceId: "x" })).exists).toBe(
      false
    );
  });

  it("resuelve un perfil a través de ProfileManager", async () => {
    const profileManager = {
      getProfile: (id: string) =>
        id === "pr1" ? { metadata: { id }, configuration: {} } : undefined,
    };
    const resolver = new ManagedBackupSourceResolver({ profileManager: profileManager as never });
    expect((await resolver.resolve({ resourceType: "profile", resourceId: "pr1" })).exists).toBe(
      true
    );
    expect((await resolver.resolve({ resourceType: "profile", resourceId: "x" })).exists).toBe(
      false
    );
  });

  it("resuelve metadatos de plugin a través de PluginManager", async () => {
    const pluginManager = {
      getPlugin: (id: string) => (id === "pl1" ? { manifest: { id }, metadata: {} } : undefined),
    };
    const resolver = new ManagedBackupSourceResolver({ pluginManager: pluginManager as never });
    expect(
      (await resolver.resolve({ resourceType: "plugin-metadata", resourceId: "pl1" })).exists
    ).toBe(true);
    expect(
      (await resolver.resolve({ resourceType: "plugin-metadata", resourceId: "x" })).exists
    ).toBe(false);
  });

  it("resuelve una sección de configuración a través de ConfigManager", async () => {
    const configManager = {
      getSection: async (ns: string) => (ns === "c1" ? { a: 1 } : undefined),
    };
    const resolver = new ManagedBackupSourceResolver({ configManager: configManager as never });
    expect((await resolver.resolve({ resourceType: "config", resourceId: "c1" })).exists).toBe(
      true
    );
    expect((await resolver.resolve({ resourceType: "config", resourceId: "x" })).exists).toBe(
      false
    );
  });

  it("resuelve una referencia de secreto sin exponer nunca su valor", async () => {
    const secretsManager = { hasSecret: async (key: string) => key === "s1" };
    const resolver = new ManagedBackupSourceResolver({ secretsManager: secretsManager as never });
    const found = await resolver.resolve({ resourceType: "secret-ref", resourceId: "s1" });
    expect(found.exists).toBe(true);
    expect(found.snapshot).toEqual({ key: "s1" });
    expect(JSON.stringify(found)).not.toContain("valor-secreto");
    expect((await resolver.resolve({ resourceType: "secret-ref", resourceId: "x" })).exists).toBe(
      false
    );
  });

  it("un recurso 'custom' siempre se considera existente", async () => {
    const resolver = new ManagedBackupSourceResolver();
    expect((await resolver.resolve({ resourceType: "custom", resourceId: "c1" })).exists).toBe(
      true
    );
  });
});
