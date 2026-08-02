import { describe, it, expect } from "vitest";
import { PluginRegistry } from "../../src/PluginRegistry.js";
import { createInitialPluginMetadata } from "../../src/PluginMetadata.js";
import { defaultPluginConfiguration } from "../../src/PluginConfiguration.js";
import { PluginErrorCode } from "../../src/errors/PluginErrorCode.js";
import { makeManifest } from "./support/FakePlugin.js";

function registerBasic(
  registry: PluginRegistry,
  id: string,
  overrides: Parameters<typeof makeManifest>[0] = {}
) {
  registry.register(
    makeManifest({ id, ...overrides }),
    createInitialPluginMetadata(id),
    defaultPluginConfiguration(),
    []
  );
}

describe("PluginRegistry — registro básico", () => {
  it("registra y consulta; list()/search() funcionan", () => {
    const registry = new PluginRegistry();
    registerBasic(registry, "b", { name: "Beta" });
    registerBasic(registry, "a", { name: "Alpha" });
    expect(registry.list()).toEqual(["a", "b"]);
    expect(registry.search("beta")).toEqual(["b"]);
    expect(registry.has("a")).toBe(true);
    expect(registry.has("no-existe")).toBe(false);
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new PluginRegistry();
    registerBasic(registry, "a");
    expect(() => registerBasic(registry, "a")).toThrow(
      expect.objectContaining({ code: PluginErrorCode.PLUGIN_ALREADY_REGISTERED })
    );
  });

  it("require()/toDescriptor() lanzan PLUGIN_NOT_FOUND si no existe", () => {
    const registry = new PluginRegistry();
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: PluginErrorCode.PLUGIN_NOT_FOUND })
    );
    expect(() => registry.toDescriptor("no-existe")).toThrow(
      expect.objectContaining({ code: PluginErrorCode.PLUGIN_NOT_FOUND })
    );
  });

  it("toDescriptor() expone una instantánea completa", () => {
    const registry = new PluginRegistry();
    registerBasic(registry, "a");
    const descriptor = registry.toDescriptor("a");
    expect(descriptor.manifest.id).toBe("a");
    expect(descriptor.state).toBe("registered");
    expect(descriptor.health).toBeUndefined();
  });

  it("unregister()/clear() eliminan del registro", () => {
    const registry = new PluginRegistry();
    registerBasic(registry, "a");
    registry.unregister("a");
    expect(registry.list()).toEqual([]);
    registerBasic(registry, "b");
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});

describe("PluginRegistry — estado y reemplazos", () => {
  it("setState() aplica transiciones válidas y rechaza las inválidas", () => {
    const registry = new PluginRegistry();
    registerBasic(registry, "a");
    registry.setState("a", "installed");
    expect(registry.get("a")?.state).toBe("installed");
    expect(() => registry.setState("a", "active")).toThrow(
      expect.objectContaining({ code: PluginErrorCode.PLUGIN_INVALID_STATE_TRANSITION })
    );
  });

  it("replaceManifest/replaceConfiguration/replaceGrantedPermissions/replaceMetadata sustituyen los campos", () => {
    const registry = new PluginRegistry();
    registerBasic(registry, "a");
    const newManifest = makeManifest({ id: "a", version: "2.0.0" });
    registry.replaceManifest("a", newManifest);
    expect(registry.get("a")?.manifest.version).toBe("2.0.0");

    const newConfig = defaultPluginConfiguration({ x: 1 });
    registry.replaceConfiguration("a", newConfig);
    expect(registry.get("a")?.configuration).toEqual(newConfig);

    registry.replaceGrantedPermissions("a", ["config:read"] as never);
    expect(registry.get("a")?.grantedPermissions).toEqual(["config:read"]);

    const newMetadata = createInitialPluginMetadata("a");
    registry.replaceMetadata("a", newMetadata);
    expect(registry.get("a")?.metadata).toBe(newMetadata);
  });
});

describe("PluginRegistry — dependientes activos y orden de activación", () => {
  it("getActiveDependents() encuentra plugins activos que dependen obligatoriamente de otro", () => {
    const registry = new PluginRegistry();
    registerBasic(registry, "base");
    registerBasic(registry, "consumer", { dependencies: [{ pluginId: "base", optional: false }] });
    registry.setState("consumer", "installed");
    registry.setState("consumer", "loaded");
    registry.setState("consumer", "initialized");
    registry.setState("consumer", "active");

    expect(registry.getActiveDependents("base")).toEqual(["consumer"]);
  });

  it("getActiveDependents() ignora dependencias opcionales", () => {
    const registry = new PluginRegistry();
    registerBasic(registry, "base");
    registerBasic(registry, "consumer", { dependencies: [{ pluginId: "base", optional: true }] });
    registry.setState("consumer", "installed");
    registry.setState("consumer", "loaded");
    registry.setState("consumer", "initialized");
    registry.setState("consumer", "active");

    expect(registry.getActiveDependents("base")).toEqual([]);
  });

  it("resolveActivationOrder() respeta dependencias obligatorias y prioridad", () => {
    const registry = new PluginRegistry();
    registry.register(
      makeManifest({ id: "provider" }),
      createInitialPluginMetadata("provider"),
      defaultPluginConfiguration()
    );
    registry.register(
      makeManifest({ id: "consumer", dependencies: [{ pluginId: "provider", optional: false }] }),
      createInitialPluginMetadata("consumer"),
      defaultPluginConfiguration()
    );

    expect(registry.resolveActivationOrder(["consumer", "provider"])).toEqual([
      "provider",
      "consumer",
    ]);
  });

  it("resolveActivationOrder() lanza PLUGIN_MISSING_DEPENDENCY si falta una dependencia obligatoria", () => {
    const registry = new PluginRegistry();
    registerBasic(registry, "consumer", {
      dependencies: [{ pluginId: "no-existe", optional: false }],
    });
    expect(() => registry.resolveActivationOrder(["consumer"])).toThrow(
      expect.objectContaining({ code: PluginErrorCode.PLUGIN_MISSING_DEPENDENCY })
    );
  });

  it("resolveActivationOrder() lanza PLUGIN_DEPENDENCY_CYCLE ante un ciclo", () => {
    const registry = new PluginRegistry();
    registerBasic(registry, "a", { dependencies: [{ pluginId: "b", optional: false }] });
    registerBasic(registry, "b", { dependencies: [{ pluginId: "a", optional: false }] });
    expect(() => registry.resolveActivationOrder(["a", "b"])).toThrow(
      expect.objectContaining({ code: PluginErrorCode.PLUGIN_DEPENDENCY_CYCLE })
    );
  });
});
