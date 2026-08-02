import { describe, it, expect } from "vitest";
import { Plugin } from "../../src/Plugin.js";

class MinimalPlugin extends Plugin {}

describe("Plugin — comportamiento por defecto", () => {
  it("todos los ganchos son no-op por defecto", async () => {
    const plugin = new MinimalPlugin();
    await expect(plugin.onInstall({} as never)).resolves.toBeUndefined();
    await expect(plugin.onLoad({} as never)).resolves.toBeUndefined();
    await expect(plugin.onInit({} as never)).resolves.toBeUndefined();
    await expect(plugin.onActivate({} as never)).resolves.toBeUndefined();
    await expect(plugin.onDeactivate()).resolves.toBeUndefined();
    await expect(plugin.onUnload()).resolves.toBeUndefined();
    await expect(plugin.onUninstall()).resolves.toBeUndefined();
  });

  it("checkHealth() es saludable por defecto", async () => {
    await expect(new MinimalPlugin().checkHealth()).resolves.toBe(true);
  });
});
