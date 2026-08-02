import { describe, it, expect } from "vitest";
import { ManagedRestoreTargetResolver } from "../../src/RestoreTargetResolver.js";
import { RestoreErrorCode } from "../../src/errors/RestoreErrorCode.js";

describe("ManagedRestoreTargetResolver — config", () => {
  it("aplica una sección de configuración capturando el valor previo", async () => {
    const store = new Map<string, unknown>([["ns1", { antiguo: true }]]);
    const configManager = {
      getSection: async (ns: string) => store.get(ns),
      setSection: async (ns: string, value: unknown) => void store.set(ns, value),
      deleteSection: async (ns: string) => void store.delete(ns),
    };
    const resolver = new ManagedRestoreTargetResolver({ configManager: configManager as never });

    const result = await resolver.apply(
      { resourceType: "config", resourceId: "ns1" },
      { nuevo: true },
      { allowOverwriteProtected: false }
    );

    expect(result.applied).toBe(true);
    expect(result.previousValue).toEqual({ antiguo: true });
    expect(store.get("ns1")).toEqual({ nuevo: true });
  });

  it("rechaza sobrescribir una sección protegida sin autorización", async () => {
    const configManager = {
      getSection: async () => undefined,
      setSection: async () => {},
      deleteSection: async () => {},
    };
    const resolver = new ManagedRestoreTargetResolver({
      configManager: configManager as never,
      protectedNamespaces: ["critico"],
    });

    await expect(
      resolver.apply(
        { resourceType: "config", resourceId: "critico" },
        {},
        { allowOverwriteProtected: false }
      )
    ).rejects.toMatchObject({ code: RestoreErrorCode.RESTORE_PROTECTED_RESOURCE });
  });

  it("permite sobrescribir una sección protegida con allowOverwriteProtected", async () => {
    const configManager = {
      getSection: async () => undefined,
      setSection: async () => {},
      deleteSection: async () => {},
    };
    const resolver = new ManagedRestoreTargetResolver({
      configManager: configManager as never,
      protectedNamespaces: ["critico"],
    });

    const result = await resolver.apply(
      { resourceType: "config", resourceId: "critico" },
      {},
      { allowOverwriteProtected: true }
    );
    expect(result.applied).toBe(true);
    expect(result.wasProtected).toBe(true);
  });

  it("advierte si no hay ConfigManager integrado", async () => {
    const resolver = new ManagedRestoreTargetResolver();
    const result = await resolver.apply(
      { resourceType: "config", resourceId: "ns1" },
      {},
      {
        allowOverwriteProtected: false,
      }
    );
    expect(result.applied).toBe(false);
    expect(result.warning).toBeDefined();
  });

  it("rollback() restaura el valor previo, o elimina la sección si no había valor previo", async () => {
    const store = new Map<string, unknown>();
    const configManager = {
      getSection: async (ns: string) => store.get(ns),
      setSection: async (ns: string, value: unknown) => void store.set(ns, value),
      deleteSection: async (ns: string) => void store.delete(ns),
    };
    const resolver = new ManagedRestoreTargetResolver({ configManager: configManager as never });

    await resolver.rollback({ resourceType: "config", resourceId: "ns1" }, { previo: true });
    expect(store.get("ns1")).toEqual({ previo: true });

    await resolver.rollback({ resourceType: "config", resourceId: "ns1" }, undefined);
    expect(store.has("ns1")).toBe(false);
  });

  it("rollback() no hace nada para recursos que no son 'config' o sin ConfigManager", async () => {
    const resolver = new ManagedRestoreTargetResolver();
    await expect(
      resolver.rollback({ resourceType: "project", resourceId: "p1" }, {})
    ).resolves.toBeUndefined();
  });
});

describe("ManagedRestoreTargetResolver — otros tipos de recurso (solo verificación)", () => {
  it("project/workspace/profile/plugin-metadata solo verifican existencia, sin escribir", async () => {
    const projectManager = { getProject: (id: string) => (id === "p1" ? {} : undefined) };
    const workspaceManager = { getWorkspace: (id: string) => (id === "w1" ? {} : undefined) };
    const profileManager = { getProfile: (id: string) => (id === "pr1" ? {} : undefined) };
    const pluginManager = { getPlugin: (id: string) => (id === "pl1" ? {} : undefined) };
    const resolver = new ManagedRestoreTargetResolver({
      projectManager: projectManager as never,
      workspaceManager: workspaceManager as never,
      profileManager: profileManager as never,
      pluginManager: pluginManager as never,
    });

    const project = await resolver.apply(
      { resourceType: "project", resourceId: "p1" },
      {},
      {
        allowOverwriteProtected: false,
      }
    );
    expect(project.applied).toBe(false);
    expect(project.warning).toBeUndefined();

    const missingWorkspace = await resolver.apply(
      { resourceType: "workspace", resourceId: "no-existe" },
      {},
      {
        allowOverwriteProtected: false,
      }
    );
    expect(missingWorkspace.warning).toBeDefined();

    expect(
      (
        await resolver.apply(
          { resourceType: "profile", resourceId: "pr1" },
          {},
          { allowOverwriteProtected: false }
        )
      ).applied
    ).toBe(false);
    expect(
      (
        await resolver.apply(
          { resourceType: "plugin-metadata", resourceId: "pl1" },
          {},
          {
            allowOverwriteProtected: false,
          }
        )
      ).applied
    ).toBe(false);
  });

  it("secret-ref nunca se restaura automáticamente", async () => {
    const resolver = new ManagedRestoreTargetResolver();
    const result = await resolver.apply(
      { resourceType: "secret-ref", resourceId: "api-key" },
      {},
      {
        allowOverwriteProtected: false,
      }
    );
    expect(result.applied).toBe(false);
    expect(result.warning).toContain("api-key");
  });

  it("un recurso 'custom' no se aplica ni advierte", async () => {
    const resolver = new ManagedRestoreTargetResolver();
    const result = await resolver.apply(
      { resourceType: "custom", resourceId: "c1" },
      {},
      {
        allowOverwriteProtected: false,
      }
    );
    expect(result).toEqual({ applied: false, wasProtected: false });
  });
});
