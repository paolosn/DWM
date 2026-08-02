import { describe, it, expect } from "vitest";
import { isPluginStateTransitionAllowed } from "../../src/PluginState.js";
import { isValidPluginPermission, PluginPermission } from "../../src/PluginPermissions.js";
import { checkPluginCompatibility, compareSemver } from "../../src/PluginCompatibility.js";
import {
  defaultPluginConfiguration,
  validatePluginConfiguration,
} from "../../src/PluginConfiguration.js";
import { createInitialPluginMetadata, touchPluginMetadata } from "../../src/PluginMetadata.js";
import { emptyPluginCapabilities } from "../../src/PluginCapabilities.js";
import { PluginErrorCode } from "../../src/errors/PluginErrorCode.js";
import { makeManifest } from "./support/FakePlugin.js";

describe("emptyPluginCapabilities", () => {
  it("devuelve provided vacío", () => {
    expect(emptyPluginCapabilities()).toEqual({ provided: [] });
  });
});

describe("isPluginStateTransitionAllowed", () => {
  it("permite el ciclo de vida normal completo", () => {
    expect(isPluginStateTransitionAllowed("discovered", "registered")).toBe(true);
    expect(isPluginStateTransitionAllowed("registered", "installed")).toBe(true);
    expect(isPluginStateTransitionAllowed("installed", "loaded")).toBe(true);
    expect(isPluginStateTransitionAllowed("loaded", "initialized")).toBe(true);
    expect(isPluginStateTransitionAllowed("initialized", "active")).toBe(true);
    expect(isPluginStateTransitionAllowed("active", "inactive")).toBe(true);
    expect(isPluginStateTransitionAllowed("inactive", "active")).toBe(true);
    expect(isPluginStateTransitionAllowed("inactive", "installed")).toBe(true);
  });

  it("rechaza transiciones inválidas", () => {
    expect(isPluginStateTransitionAllowed("registered", "active")).toBe(false);
    expect(isPluginStateTransitionAllowed("uninstalled", "registered")).toBe(false);
    expect(isPluginStateTransitionAllowed("active", "active")).toBe(false);
  });
});

describe("isValidPluginPermission", () => {
  it("valida solo el catálogo conocido", () => {
    expect(isValidPluginPermission(PluginPermission.CONFIG_READ)).toBe(true);
    expect(isValidPluginPermission("permiso-desconocido")).toBe(false);
    expect(isValidPluginPermission(42)).toBe(false);
  });
});

describe("checkPluginCompatibility / compareSemver", () => {
  it("compareSemver ordena versiones correctamente", () => {
    expect(compareSemver("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareSemver("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });

  it("es compatible si dwmVersion satisface min/max", () => {
    const manifest = makeManifest({ minDwmVersion: "1.0.0", maxDwmVersion: "2.0.0" });
    expect(checkPluginCompatibility(manifest, "1.5.0").compatible).toBe(true);
  });

  it("es incompatible si dwmVersion es menor que minDwmVersion", () => {
    const manifest = makeManifest({ minDwmVersion: "2.0.0" });
    const result = checkPluginCompatibility(manifest, "1.0.0");
    expect(result.compatible).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("es incompatible si dwmVersion supera maxDwmVersion", () => {
    const manifest = makeManifest({ minDwmVersion: "1.0.0", maxDwmVersion: "1.5.0" });
    expect(checkPluginCompatibility(manifest, "2.0.0").compatible).toBe(false);
  });

  it("es incompatible si dwmVersion no es un semver válido", () => {
    const manifest = makeManifest();
    expect(checkPluginCompatibility(manifest, "no-semver").compatible).toBe(false);
  });

  it("es incompatible si minDwmVersion/maxDwmVersion del manifiesto no son semver válidos", () => {
    expect(checkPluginCompatibility(makeManifest({ minDwmVersion: "x" }), "1.0.0").compatible).toBe(
      false
    );
    expect(
      checkPluginCompatibility(
        makeManifest({ minDwmVersion: "1.0.0", maxDwmVersion: "x" }),
        "1.0.0"
      ).compatible
    ).toBe(false);
  });
});

describe("validatePluginConfiguration", () => {
  it("acepta la configuración por defecto", () => {
    expect(() => validatePluginConfiguration(defaultPluginConfiguration())).not.toThrow();
  });

  it("rechaza config ausente", () => {
    expect(() => validatePluginConfiguration(null as never)).toThrow(
      expect.objectContaining({ code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION })
    );
  });

  it("rechaza enabled no booleano", () => {
    expect(() =>
      validatePluginConfiguration({ ...defaultPluginConfiguration(), enabled: "si" as never })
    ).toThrow(expect.objectContaining({ code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION }));
  });

  it("rechaza priority no numérico", () => {
    expect(() =>
      validatePluginConfiguration({ ...defaultPluginConfiguration(), priority: "alta" as never })
    ).toThrow(expect.objectContaining({ code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION }));
  });

  it("rechaza settings que no sea un objeto", () => {
    expect(() =>
      validatePluginConfiguration({ ...defaultPluginConfiguration(), settings: [1, 2] as never })
    ).toThrow(expect.objectContaining({ code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION }));
  });
});

describe("PluginMetadata", () => {
  it("createInitialPluginMetadata fija installedAt=updatedAt", () => {
    const metadata = createInitialPluginMetadata("id1");
    expect(metadata.installedAt).toBe(metadata.updatedAt);
  });

  it("touchPluginMetadata actualiza updatedAt preservando el resto", async () => {
    const metadata = createInitialPluginMetadata("id1");
    await new Promise((r) => setTimeout(r, 5));
    const touched = touchPluginMetadata(metadata);
    expect(touched.updatedAt).not.toBe(metadata.updatedAt);
    expect(touched.id).toBe(metadata.id);
  });
});
