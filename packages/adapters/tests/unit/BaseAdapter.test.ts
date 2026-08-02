import { describe, it, expect } from "vitest";
import { BaseAdapter } from "../../src/BaseAdapter.js";
import { AdapterSubject, isValidAdapterSubject } from "../../src/AdapterSubject.js";
import { emptyCapabilities } from "../../src/AdapterCapabilities.js";
import { makeHealth } from "../../src/AdapterHealth.js";

class MinimalAdapter extends BaseAdapter {
  readonly id = "minimal";
  readonly subject = AdapterSubject.GIT;
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";
}

describe("BaseAdapter — comportamiento por defecto", () => {
  it("capabilities por defecto está vacío", () => {
    expect(new MinimalAdapter().capabilities).toEqual(emptyCapabilities());
  });

  it("onInit/onActivate/onDeactivate/onDispose son no-op por defecto", async () => {
    const adapter = new MinimalAdapter();
    await expect(adapter.onInit({} as never)).resolves.toBeUndefined();
    await expect(adapter.onActivate({} as never)).resolves.toBeUndefined();
    await expect(adapter.onDeactivate()).resolves.toBeUndefined();
    await expect(adapter.onDispose()).resolves.toBeUndefined();
  });

  it("checkHealth() es saludable por defecto", async () => {
    await expect(new MinimalAdapter().checkHealth()).resolves.toBe(true);
  });
});

describe("AdapterSubject", () => {
  it("isValidAdapterSubject valida solo el catálogo conocido", () => {
    expect(isValidAdapterSubject("git")).toBe(true);
    expect(isValidAdapterSubject("vscode")).toBe(true);
    expect(isValidAdapterSubject("herramienta-desconocida")).toBe(false);
    expect(isValidAdapterSubject(42)).toBe(false);
  });
});

describe("AdapterHealth", () => {
  it("makeHealth() incluye detail solo cuando se indica", () => {
    const healthy = makeHealth("a", true);
    expect(healthy.detail).toBeUndefined();
    const unhealthy = makeHealth("a", false, "motivo x");
    expect(unhealthy.detail).toBe("motivo x");
  });
});
