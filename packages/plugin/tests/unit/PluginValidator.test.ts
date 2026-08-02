import { describe, it, expect } from "vitest";
import { PluginValidator } from "../../src/PluginValidator.js";
import { PluginPermission } from "../../src/PluginPermissions.js";
import { PluginErrorCode } from "../../src/errors/PluginErrorCode.js";
import { makeManifest } from "./support/FakePlugin.js";

describe("PluginValidator", () => {
  it("valida un manifiesto correcto", () => {
    const validator = new PluginValidator();
    const result = validator.validateManifest(makeManifest());
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("detecta id/name ausentes", () => {
    const validator = new PluginValidator();
    const result = validator.validateManifest(makeManifest({ id: "", name: "" }));
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.field)).toEqual(expect.arrayContaining(["id", "name"]));
  });

  it("detecta version/minDwmVersion/maxDwmVersion con formato inválido", () => {
    const validator = new PluginValidator();
    const result = validator.validateManifest(
      makeManifest({ version: "x", minDwmVersion: "x", maxDwmVersion: "y" })
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.field)).toEqual(
      expect.arrayContaining(["version", "minDwmVersion", "maxDwmVersion"])
    );
  });

  it("detecta entryPoint ausente", () => {
    const validator = new PluginValidator();
    const result = validator.validateManifest(makeManifest({ entryPoint: "" }));
    expect(result.valid).toBe(false);
  });

  it("detecta autorreferencia en dependencies", () => {
    const validator = new PluginValidator();
    const result = validator.validateManifest(
      makeManifest({ dependencies: [{ pluginId: "sample-plugin", optional: false }] })
    );
    expect(result.valid).toBe(false);
  });

  it("detecta dependencies mal formadas", () => {
    const validator = new PluginValidator();
    expect(validator.validateManifest(makeManifest({ dependencies: "x" as never })).valid).toBe(
      false
    );
    expect(
      validator.validateManifest(
        makeManifest({ dependencies: [{ pluginId: "", optional: false }] })
      ).valid
    ).toBe(false);
    expect(
      validator.validateManifest(
        makeManifest({ dependencies: [{ pluginId: "otro", optional: false, minVersion: "x" }] })
      ).valid
    ).toBe(false);
  });

  it("detecta moduleDependencies mal formado", () => {
    const validator = new PluginValidator();
    expect(
      validator.validateManifest(makeManifest({ moduleDependencies: "x" as never })).valid
    ).toBe(false);
    expect(
      validator.validateManifest(makeManifest({ moduleDependencies: [1] as never })).valid
    ).toBe(false);
  });

  it("detecta permissions mal formado o con permiso desconocido", () => {
    const validator = new PluginValidator();
    expect(validator.validateManifest(makeManifest({ permissions: "x" as never })).valid).toBe(
      false
    );
    expect(
      validator.validateManifest(
        makeManifest({ permissions: [{ permission: "no-existe" as never, required: true }] })
      ).valid
    ).toBe(false);
    expect(
      validator.validateManifest(
        makeManifest({
          permissions: [{ permission: PluginPermission.CONFIG_READ, required: "si" as never }],
        })
      ).valid
    ).toBe(false);
  });

  it("acepta permissions bien formadas", () => {
    const validator = new PluginValidator();
    const result = validator.validateManifest(
      makeManifest({ permissions: [{ permission: PluginPermission.CONFIG_READ, required: true }] })
    );
    expect(result.valid).toBe(true);
  });

  it("detecta capabilities mal formado", () => {
    const validator = new PluginValidator();
    expect(
      validator.validateManifest(makeManifest({ capabilities: undefined as never })).valid
    ).toBe(false);
    expect(
      validator.validateManifest(makeManifest({ capabilities: { provided: "x" as never } })).valid
    ).toBe(false);
  });

  it("detecta defaultConfiguration/metadata mal formados si se indican", () => {
    const validator = new PluginValidator();
    expect(
      validator.validateManifest(makeManifest({ defaultConfiguration: "x" as never })).valid
    ).toBe(false);
    expect(validator.validateManifest(makeManifest({ metadata: "x" as never })).valid).toBe(false);
  });

  it("rechaza un manifiesto que no es un objeto", () => {
    const validator = new PluginValidator();
    const result = validator.validateManifest(null as never);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it("assertValidManifest lanza PLUGIN_INVALID_MANIFEST con los diagnósticos agregados", () => {
    const validator = new PluginValidator();
    expect(() => validator.assertValidManifest(makeManifest({ id: "" }))).toThrow(
      expect.objectContaining({ code: PluginErrorCode.PLUGIN_INVALID_MANIFEST })
    );
  });

  it("assertValidManifest no lanza si el manifiesto es válido", () => {
    const validator = new PluginValidator();
    expect(() => validator.assertValidManifest(makeManifest())).not.toThrow();
  });
});
