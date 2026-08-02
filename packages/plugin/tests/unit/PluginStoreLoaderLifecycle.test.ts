import { describe, it, expect, afterEach } from "vitest";
import { PluginStore } from "../../src/PluginStore.js";
import { PluginLoader } from "../../src/PluginLoader.js";
import { PluginLifecycle } from "../../src/PluginLifecycle.js";
import { StaticPluginSource } from "../../src/PluginSource.js";
import { createInitialPluginMetadata } from "../../src/PluginMetadata.js";
import { defaultPluginConfiguration } from "../../src/PluginConfiguration.js";
import { PluginErrorCode } from "../../src/errors/PluginErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeFactory, makeManifest } from "./support/FakePlugin.js";

const FAKE_CONTEXT = {
  pluginId: "x",
  configuration: defaultPluginConfiguration(),
  getSecret: async () => undefined,
  getConfigSection: async () => undefined,
} as never;

describe("PluginStore", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  it("read() devuelve undefined si no existe; write()/read() persisten y recuperan", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new PluginStore(`${dir}/nested`);
    expect(await store.read("no-existe")).toBeUndefined();

    const persisted = {
      manifest: makeManifest(),
      metadata: createInitialPluginMetadata("sample-plugin"),
      configuration: defaultPluginConfiguration(),
      grantedPermissions: [],
      state: "installed" as const,
    };
    await store.write(persisted);
    expect(await store.read("sample-plugin")).toEqual(persisted);
  });

  it("delete() elimina; es idempotente si ya no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new PluginStore(dir);
    await store.write({
      manifest: makeManifest(),
      metadata: createInitialPluginMetadata("sample-plugin"),
      configuration: defaultPluginConfiguration(),
      grantedPermissions: [],
      state: "installed",
    });
    await store.delete("sample-plugin");
    expect(await store.read("sample-plugin")).toBeUndefined();
    await expect(store.delete("sample-plugin")).resolves.toBeUndefined();
  });

  it("listIds() devuelve los persistidos y [] si el directorio no existe", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const store = new PluginStore(`${dir}/no-creado`);
    expect(await store.listIds()).toEqual([]);

    await store.write({
      manifest: makeManifest({ id: "uno" }),
      metadata: createInitialPluginMetadata("uno"),
      configuration: defaultPluginConfiguration(),
      grantedPermissions: [],
      state: "installed",
    });
    expect(await store.listIds()).toEqual(["uno"]);
  });

  it("read() lanza ante contenido JSON inválido", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/roto.json`, "{ no es json", "utf-8");
    const store = new PluginStore(dir);
    await expect(store.read("roto")).rejects.toThrow();
  });

  it("write() lanza PLUGIN_INSTALL_FAILED ante un fallo real de escritura", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/no-es-directorio`;
    await fs.writeFile(conflictFile, "contenido");
    const store = new PluginStore(`${conflictFile}/subdir`);
    await expect(
      store.write({
        manifest: makeManifest(),
        metadata: createInitialPluginMetadata("sample-plugin"),
        configuration: defaultPluginConfiguration(),
        grantedPermissions: [],
        state: "installed",
      })
    ).rejects.toMatchObject({ code: PluginErrorCode.PLUGIN_INSTALL_FAILED });
  });

  it("delete() lanza PLUGIN_UNINSTALL_FAILED ante un fallo real distinto de ausencia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    await fs.mkdir(`${dir}/x.json`, { recursive: true });
    const store = new PluginStore(dir);
    await expect(store.delete("x")).rejects.toMatchObject({
      code: PluginErrorCode.PLUGIN_UNINSTALL_FAILED,
    });
  });

  it("listIds() lanza ante un fallo real distinto de ausencia", async () => {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/archivo`;
    await fs.writeFile(conflictFile, "contenido");
    const store = new PluginStore(conflictFile);
    await expect(store.listIds()).rejects.toThrow();
  });
});

describe("PluginLoader", () => {
  it("load() devuelve la instancia construida por la fábrica", async () => {
    const loader = new PluginLoader();
    const { factory, plugin } = makeFactory();
    await expect(loader.load("sample-plugin", factory)).resolves.toBe(plugin);
  });

  it("load() envuelve un fallo de la fábrica como PLUGIN_LOAD_FAILED", async () => {
    const loader = new PluginLoader();
    const factory = {
      create: () => {
        throw new Error("fábrica rota");
      },
    };
    await expect(loader.load("sample-plugin", factory)).rejects.toMatchObject({
      code: PluginErrorCode.PLUGIN_LOAD_FAILED,
    });
  });
});

describe("PluginLifecycle", () => {
  it("invoca cada gancho y traduce los fallos al código correspondiente", async () => {
    const lifecycle = new PluginLifecycle();
    const { plugin } = makeFactory();

    await lifecycle.install("id", plugin, FAKE_CONTEXT);
    await lifecycle.load("id", plugin, FAKE_CONTEXT);
    await lifecycle.initialize("id", plugin, FAKE_CONTEXT);
    await lifecycle.activate("id", plugin, FAKE_CONTEXT);
    await lifecycle.deactivate("id", plugin);
    await lifecycle.unload("id", plugin);
    await lifecycle.uninstall("id", plugin);
    await expect(lifecycle.checkHealth(plugin)).resolves.toBe(true);

    expect(plugin.installCount).toBe(1);
    expect(plugin.loadCount).toBe(1);
    expect(plugin.initCount).toBe(1);
    expect(plugin.activateCount).toBe(1);
    expect(plugin.deactivateCount).toBe(1);
    expect(plugin.unloadCount).toBe(1);
    expect(plugin.uninstallCount).toBe(1);
  });

  it("envuelve cada fallo con el PluginErrorCode de su fase", async () => {
    const lifecycle = new PluginLifecycle();
    const { plugin: p1 } = makeFactory({ failInstall: true });
    await expect(lifecycle.install("id", p1, FAKE_CONTEXT)).rejects.toMatchObject({
      code: PluginErrorCode.PLUGIN_INSTALL_FAILED,
    });

    const { plugin: p2 } = makeFactory({ failActivate: true });
    await expect(lifecycle.activate("id", p2, FAKE_CONTEXT)).rejects.toMatchObject({
      code: PluginErrorCode.PLUGIN_ACTIVATE_FAILED,
    });

    const { plugin: p3 } = makeFactory({ failDeactivate: true });
    await expect(lifecycle.deactivate("id", p3)).rejects.toMatchObject({
      code: PluginErrorCode.PLUGIN_DEACTIVATE_FAILED,
    });

    const { plugin: p4 } = makeFactory({ failUninstall: true });
    await expect(lifecycle.uninstall("id", p4)).rejects.toMatchObject({
      code: PluginErrorCode.PLUGIN_UNINSTALL_FAILED,
    });
  });
});

describe("StaticPluginSource", () => {
  it("discover() devuelve los manifiestos con los que fue construida", async () => {
    const manifest = makeManifest();
    const source = new StaticPluginSource([manifest]);
    await expect(source.discover()).resolves.toEqual([manifest]);
  });
});
