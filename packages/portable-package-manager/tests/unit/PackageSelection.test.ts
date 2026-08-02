import { describe, it, expect } from "vitest";
import { resolvePackageSelection, isEntrySelected } from "../../src/PackageSelection.js";
import type { PackageResourceSource } from "../../src/PortablePackageTypes.js";

function source(id: string, optional = false): PackageResourceSource {
  return { id, absolutePath: `/fake/${id}`, optional };
}

describe("resolvePackageSelection", () => {
  const availableSources = [
    source("workspace"),
    source("config"),
    source("secrets"),
    source("backups"),
    source("logs"),
    source("tools"),
    source("runtime"),
  ];

  it("por defecto excluye recursos opcionales (backups/logs/tools/runtime) y secrets", () => {
    const selection = resolvePackageSelection({ availableSources });
    const ids = selection.sources.map((s) => s.id);
    expect(ids).toEqual(["workspace", "config"]);
    expect(selection.includedOptionalResources).toEqual([]);
    expect(selection.includeSecrets).toBe(false);
  });

  it("incluye recursos opcionales solo si se piden explícitamente", () => {
    const selection = resolvePackageSelection({
      availableSources,
      includeOptionalResources: ["logs", "backups"],
    });
    const ids = selection.sources.map((s) => s.id);
    expect(ids).toContain("logs");
    expect(ids).toContain("backups");
    expect(ids).not.toContain("tools");
    expect(selection.includedOptionalResources.slice().sort()).toEqual(["backups", "logs"]);
  });

  it("incluye secrets únicamente con includeSecrets: true", () => {
    const withSecrets = resolvePackageSelection({ availableSources, includeSecrets: true });
    expect(withSecrets.sources.map((s) => s.id)).toContain("secrets");
    expect(withSecrets.includeSecrets).toBe(true);

    const without = resolvePackageSelection({ availableSources });
    expect(without.sources.map((s) => s.id)).not.toContain("secrets");
  });

  it("excludeResourceIds retira un recurso aunque estuviera incluido por defecto", () => {
    const selection = resolvePackageSelection({ availableSources, excludeResourceIds: ["config"] });
    expect(selection.sources.map((s) => s.id)).not.toContain("config");
  });

  it("includeHidden por defecto es true", () => {
    expect(resolvePackageSelection({ availableSources }).includeHidden).toBe(true);
    expect(resolvePackageSelection({ availableSources, includeHidden: false }).includeHidden).toBe(
      false
    );
  });

  it("propaga los patrones de inclusión/exclusión indicados", () => {
    const selection = resolvePackageSelection({
      availableSources,
      excludePatterns: ["**/*.tmp"],
      includePatterns: ["config/**"],
    });
    expect(selection.excludePatterns).toEqual(["**/*.tmp"]);
    expect(selection.includePatterns).toEqual(["config/**"]);
  });
});

describe("isEntrySelected", () => {
  it("incluye todo por defecto sin patrones", () => {
    const selection = resolvePackageSelection({ availableSources: [] });
    expect(isEntrySelected("config/app.json", selection)).toBe(true);
  });

  it("excluye rutas que coinciden con excludePatterns", () => {
    const selection = resolvePackageSelection({
      availableSources: [],
      excludePatterns: ["**/*.tmp"],
    });
    expect(isEntrySelected("logs/debug.tmp", selection)).toBe(false);
    expect(isEntrySelected("logs/debug.log", selection)).toBe(true);
  });

  it("con includePatterns, solo incluye lo que coincide con alguno", () => {
    const selection = resolvePackageSelection({
      availableSources: [],
      includePatterns: ["config/**", "profiles/**"],
    });
    expect(isEntrySelected("config/app.json", selection)).toBe(true);
    expect(isEntrySelected("profiles/default.json", selection)).toBe(true);
    expect(isEntrySelected("logs/debug.log", selection)).toBe(false);
  });

  it("excludePatterns tiene prioridad sobre includePatterns", () => {
    const selection = resolvePackageSelection({
      availableSources: [],
      includePatterns: ["config/**"],
      excludePatterns: ["config/secret.json"],
    });
    expect(isEntrySelected("config/secret.json", selection)).toBe(false);
    expect(isEntrySelected("config/app.json", selection)).toBe(true);
  });
});
