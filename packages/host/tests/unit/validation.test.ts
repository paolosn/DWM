import { describe, it, expect } from "vitest";
import { validateHostConfiguration } from "../../src/config/validateHostConfiguration.js";
import { validateManifestShape } from "../../src/manifests/validateManifest.js";
import { HostErrorCode } from "../../src/errors/HostErrorCatalog.js";
import { makeComponentDescriptor, makeManifest, makeUseCase } from "../support/doubles.js";
import { makeHostConfiguration } from "../support/hostConfig.js";

describe("validateHostConfiguration", () => {
  it("acepta una configuración válida", () => {
    const config = makeHostConfiguration({
      workspaceRoot: "/tmp/x",
      components: [makeComponentDescriptor()],
    });
    expect(() => validateHostConfiguration(config)).not.toThrow();
  });

  it("rechaza workspaceRoot vacío", () => {
    const config = makeHostConfiguration({ workspaceRoot: "  " });
    expect(() => validateHostConfiguration(config)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );
  });

  it("rechaza ids de componente duplicados", () => {
    const a = makeComponentDescriptor({ manifest: { id: "dup" } });
    const b = makeComponentDescriptor({ manifest: { id: "dup" } });
    const config = makeHostConfiguration({ workspaceRoot: "/tmp/x", components: [a, b] });
    expect(() => validateHostConfiguration(config)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );
  });

  it("rechaza un descriptor sin fábrica válida", () => {
    const descriptor = makeComponentDescriptor();
    const config = makeHostConfiguration({
      workspaceRoot: "/tmp/x",
      components: [{ ...descriptor, factory: {} as never }],
    });
    expect(() => validateHostConfiguration(config)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );
  });

  it("rechaza un proveedor de dependencias que no sea función", () => {
    const config = makeHostConfiguration({
      workspaceRoot: "/tmp/x",
      dependencyProviders: { clock: 42 as never },
    });
    expect(() => validateHostConfiguration(config)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );
  });

  it("rechaza casos de uso duplicados o mal formados", () => {
    const useCase = makeUseCase({ id: "uc" });
    const config1 = makeHostConfiguration({
      workspaceRoot: "/tmp/x",
      useCases: [useCase, useCase],
    });
    expect(() => validateHostConfiguration(config1)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );

    const config2 = makeHostConfiguration({
      workspaceRoot: "/tmp/x",
      useCases: [{ ...useCase, handle: undefined as never }],
    });
    expect(() => validateHostConfiguration(config2)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );
  });

  it("rechaza config ausente o no-objeto", () => {
    expect(() => validateHostConfiguration(null as never)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );
  });

  it("rechaza components que no sea un array", () => {
    const config = makeHostConfiguration({ workspaceRoot: "/tmp/x" });
    expect(() => validateHostConfiguration({ ...config, components: "no-array" as never })).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );
  });

  it("rechaza useCases que no sea un array", () => {
    const config = makeHostConfiguration({ workspaceRoot: "/tmp/x" });
    expect(() => validateHostConfiguration({ ...config, useCases: "no-array" as never })).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );
  });

  it("rechaza un caso de uso sin id válido o con requiredComponentIds mal formado", () => {
    const config1 = makeHostConfiguration({
      workspaceRoot: "/tmp/x",
      useCases: [{ id: "", requiredComponentIds: [], handle: async () => {} }],
    });
    expect(() => validateHostConfiguration(config1)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );

    const config2 = makeHostConfiguration({
      workspaceRoot: "/tmp/x",
      useCases: [{ id: "uc", requiredComponentIds: "no-array" as never, handle: async () => {} }],
    });
    expect(() => validateHostConfiguration(config2)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );
  });

  it("rechaza un descriptor de componente que no sea un objeto", () => {
    const config = makeHostConfiguration({ workspaceRoot: "/tmp/x", components: [null as never] });
    expect(() => validateHostConfiguration(config)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );
  });

  it("rechaza un descriptor sin manifest.id", () => {
    const config = makeHostConfiguration({
      workspaceRoot: "/tmp/x",
      components: [{ manifest: {}, factory: { build: async () => ({}) }, enabled: true } as never],
    });
    expect(() => validateHostConfiguration(config)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_CONFIGURATION })
    );
  });
});

describe("validateManifestShape", () => {
  it("acepta un manifiesto válido de módulo y de adaptador", () => {
    expect(() => validateManifestShape(makeManifest({ kind: "module" }))).not.toThrow();
    expect(() => validateManifestShape(makeManifest({ kind: "adapter" }))).not.toThrow();
  });

  it("rechaza id vacío o con espacios", () => {
    expect(() => validateManifestShape(makeManifest({ id: "" }))).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
    expect(() => validateManifestShape(makeManifest({ id: " x " }))).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
  });

  it("rechaza un adaptador sin subjectId", () => {
    const manifest = { ...makeManifest({ kind: "adapter" }), subjectId: "" };
    expect(() => validateManifestShape(manifest)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
  });

  it("rechaza kind no soportado", () => {
    const manifest = { ...makeManifest(), kind: "otro" as never };
    expect(() => validateManifestShape(manifest)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
  });

  it("rechaza versiones no semánticas", () => {
    expect(() => validateManifestShape(makeManifest({ version: "1.0" }))).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
    expect(() => validateManifestShape(makeManifest({ contractVersion: "x" }))).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
    expect(() => validateManifestShape(makeManifest({ manifestVersion: "x" }))).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
  });

  it("rechaza mandatory no booleano", () => {
    const manifest = { ...makeManifest(), mandatory: "si" as never };
    expect(() => validateManifestShape(manifest)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
  });

  it("rechaza providedCapabilities mal formado", () => {
    const notArray = { ...makeManifest(), providedCapabilities: "no-array" as never };
    expect(() => validateManifestShape(notArray)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
    const badEntry = makeManifest({ providedCapabilities: [{ name: "", version: "1.0.0" }] });
    expect(() => validateManifestShape(badEntry)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
  });

  it("rechaza requiredCapabilities mal formado", () => {
    const notArray = { ...makeManifest(), requiredCapabilities: "no-array" as never };
    expect(() => validateManifestShape(notArray)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
    const badEntry = makeManifest({
      requiredCapabilities: [{ name: "cap", version: "bad", mandatory: true }],
    });
    expect(() => validateManifestShape(badEntry)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
  });

  it("rechaza requiredDependencies mal formado", () => {
    const notArray = { ...makeManifest(), requiredDependencies: "no-array" as never };
    expect(() => validateManifestShape(notArray)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
    const badEntry = makeManifest({ requiredDependencies: [""] });
    expect(() => validateManifestShape(badEntry)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_MANIFEST })
    );
  });
});
