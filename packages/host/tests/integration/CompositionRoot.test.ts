import { describe, it, expect, afterEach } from "vitest";
import { CompositionRoot } from "../../src/composition/CompositionRoot.js";
import { HostErrorCode } from "../../src/errors/HostErrorCatalog.js";
import {
  makeComponentDescriptor,
  makeDependencyProvider,
  makeUseCase,
} from "../support/doubles.js";
import { makeHostConfiguration, makeTempWorkspace } from "../support/hostConfig.js";

function noopHooks() {
  return { onPhase: () => {}, onCoreCreated: () => {} };
}

describe("CompositionRoot — integración con DWMCore real", () => {
  const workspaces: Array<() => void> = [];
  afterEach(() => {
    workspaces.splice(0).forEach((cleanup) => cleanup());
  });

  function tempRoot(): string {
    const ws = makeTempWorkspace();
    workspaces.push(ws.cleanup);
    return ws.dir;
  }

  it("compone y registra correctamente un módulo y un adaptador", async () => {
    const moduleDescriptor = makeComponentDescriptor({ manifest: { id: "mod.a", kind: "module" } });
    const adapterDescriptor = makeComponentDescriptor({
      manifest: { id: "adp.a", kind: "adapter" },
    });
    const config = makeHostConfiguration({
      workspaceRoot: tempRoot(),
      components: [moduleDescriptor, adapterDescriptor],
    });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("ready");
    expect(result.core!.listModules()).toHaveLength(1);
    expect(result.core!.listAdapters()).toHaveLength(1);
    expect(result.report.components).toEqual(
      expect.arrayContaining([
        { componentId: "mod.a", outcome: "registered" },
        { componentId: "adp.a", outcome: "registered" },
      ])
    );

    await result.core!.shutdown();
  });

  it("respeta el orden topológico al registrar componentes dependientes", async () => {
    const provider = makeComponentDescriptor({
      manifest: { id: "provider", providedCapabilities: [{ name: "cap.a", version: "1.0.0" }] },
    });
    const consumer = makeComponentDescriptor({
      manifest: {
        id: "consumer",
        requiredCapabilities: [{ name: "cap.a", version: "1.0.0", mandatory: true }],
      },
    });
    const config = makeHostConfiguration({
      workspaceRoot: tempRoot(),
      components: [consumer, provider],
    });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("ready");
    const order = result.report.components
      .filter((c) => c.outcome === "registered")
      .map((c) => c.componentId);
    expect(order.indexOf("provider")).toBeLessThan(order.indexOf("consumer"));

    await result.core!.shutdown();
  });

  it("un componente opcional que falla al construirse se omite sin abortar", async () => {
    const good = makeComponentDescriptor({ manifest: { id: "good" } });
    const bad = makeComponentDescriptor({
      manifest: { id: "bad", mandatory: false },
      buildShouldFail: true,
    });
    const config = makeHostConfiguration({ workspaceRoot: tempRoot(), components: [good, bad] });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("ready");
    expect(result.core!.listModules()).toHaveLength(1);
    expect(result.report.components).toEqual(
      expect.arrayContaining([
        { componentId: "good", outcome: "registered" },
        expect.objectContaining({ componentId: "bad", outcome: "construction-failed" }),
      ])
    );

    await result.core!.shutdown();
  });

  it("un componente mandatorio que falla al construirse aborta y revierte", async () => {
    const disposed: string[] = [];
    const good = makeComponentDescriptor({
      manifest: { id: "1-good" },
      onDispose: () => {
        disposed.push("good");
      },
    });
    const bad = makeComponentDescriptor({
      manifest: { id: "2-bad", mandatory: true },
      buildShouldFail: true,
    });
    const config = makeHostConfiguration({ workspaceRoot: tempRoot(), components: [good, bad] });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("error");
    expect(result.report.originalError?.code).toBe(HostErrorCode.HOST_MODULE_CONSTRUCTION_FAILED);
    expect(disposed).toEqual(["good"]);
  });

  it("agrega el error original y los fallos de rollback cuando un componente ya registrado falla al liberarse", async () => {
    const good = makeComponentDescriptor({
      manifest: { id: "1-registrado-con-dispose-roto" },
      onDispose: () => {
        throw new Error("dispose roto tras el registro");
      },
    });
    const bad = makeComponentDescriptor({
      manifest: { id: "2-mandatorio-roto", mandatory: true },
      buildShouldFail: true,
    });
    const config = makeHostConfiguration({ workspaceRoot: tempRoot(), components: [good, bad] });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("error");
    expect(result.report.originalError?.code).toBe(HostErrorCode.HOST_MODULE_CONSTRUCTION_FAILED);
    expect(result.report.rollbackFailures.length).toBeGreaterThan(0);
    expect(result.report.rollbackAggregateError?.code).toBe(
      HostErrorCode.HOST_COMPOSITION_ROLLBACK_FAILED
    );
    expect(
      result.report.components.some(
        (c) =>
          c.componentId === "1-registrado-con-dispose-roto" && c.outcome === "rollback-performed"
      )
    ).toBe(true);
  });

  it("un componente mandatorio cuyo registro falla aborta, revierte, y da de baja lo ya registrado", async () => {
    const good = makeComponentDescriptor({ manifest: { id: "good" } });
    const bad = makeComponentDescriptor({
      manifest: { id: "bad", mandatory: true },
      registerShouldFail: true,
    });
    const config = makeHostConfiguration({ workspaceRoot: tempRoot(), components: [good, bad] });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("error");
    expect(result.report.originalError?.code).toBe(HostErrorCode.HOST_MODULE_REGISTRATION_FAILED);
  });

  it("aborta si el Core rechaza initialize() y no intenta construir componentes", async () => {
    const built: string[] = [];
    const descriptor = makeComponentDescriptor({
      manifest: { id: "never-built" },
    });
    // workspaceRoot inválido: un fichero en vez de un directorio provoca un
    // fallo real de FileSystemStorageProvider al intentar crear el directorio.
    const invalidRoot = makeTempWorkspace();
    workspaces.push(invalidRoot.cleanup);
    const conflictingFilePath = `${invalidRoot.dir}/config.json`;
    const fs = await import("node:fs/promises");
    await fs.mkdir(invalidRoot.dir, { recursive: true });
    await fs.writeFile(conflictingFilePath, "no soy un directorio");

    const config = makeHostConfiguration({
      // Se usa la ruta del propio fichero como raíz: cualquier intento de
      // crear "config.json/otra-cosa" dentro de él fallará.
      workspaceRoot: conflictingFilePath,
      components: [
        {
          ...descriptor,
          factory: {
            build: async () => {
              built.push(descriptor.manifest.id);
              return descriptor.factory.build({});
            },
          },
        },
      ],
    });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("error");
    expect(result.report.originalError?.code).toBe(HostErrorCode.HOST_CORE_INITIALIZATION_FAILED);
    expect(built).toHaveLength(0);
  });

  it("rechaza una dependencia externa ausente antes de construir el componente que la requiere", async () => {
    let built = false;
    const descriptor = makeComponentDescriptor({
      manifest: { id: "necesita-red", mandatory: true, requiredDependencies: ["red"] },
    });
    const config = makeHostConfiguration({
      workspaceRoot: tempRoot(),
      components: [
        {
          ...descriptor,
          factory: {
            build: async (deps) => {
              built = true;
              return descriptor.factory.build(deps);
            },
          },
        },
      ],
    });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("error");
    expect(result.report.originalError?.code).toBe(HostErrorCode.HOST_DEPENDENCY_MISSING);
    expect(built).toBe(false);
  });

  it("construye y entrega la dependencia externa declarada por el manifiesto", async () => {
    let receivedClock: unknown;
    const descriptor = makeComponentDescriptor({
      manifest: { id: "con-reloj", requiredDependencies: ["clock"] },
    });
    const clockValue = { now: () => new Date("2026-01-01T00:00:00.000Z") };
    const config = makeHostConfiguration({
      workspaceRoot: tempRoot(),
      components: [
        {
          ...descriptor,
          factory: {
            build: async (deps) => {
              receivedClock = deps.clock;
              return descriptor.factory.build(deps);
            },
          },
        },
      ],
      dependencyProviders: { clock: makeDependencyProvider(clockValue) },
    });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("ready");
    expect(receivedClock).toBe(clockValue);

    await result.core!.shutdown();
  });

  it("construye coordinadores de casos de uso con las superficies de dominio requeridas", async () => {
    const secrets = makeComponentDescriptor({
      manifest: { id: "secrets" },
      domainSurface: { getSecret: () => "s3cr3t" },
    });
    const ai = makeComponentDescriptor({
      manifest: { id: "ai" },
      domainSurface: { test: (s: string) => `probado:${s}` },
    });
    const useCase = makeUseCase({
      id: "probar-ia",
      requiredComponentIds: ["secrets", "ai"],
      handle: async (surfaces) => {
        const secret = (surfaces.secrets as { getSecret(): string }).getSecret();
        return (surfaces.ai as { test(s: string): string }).test(secret);
      },
    });
    const config = makeHostConfiguration({
      workspaceRoot: tempRoot(),
      components: [secrets, ai],
      useCases: [useCase],
    });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("ready");
    expect(result.coordinators.has("probar-ia")).toBe(true);
    const output = await result.coordinators.get("probar-ia")!.execute(undefined);
    expect(output).toBe("probado:s3cr3t");

    await result.core!.shutdown();
  });

  it("no construye un coordinador si falta alguno de los componentes que requiere", async () => {
    const onlyOne = makeComponentDescriptor({ manifest: { id: "solo-uno" } });
    const useCase = makeUseCase({
      id: "incompleto",
      requiredComponentIds: ["solo-uno", "inexistente"],
    });
    const config = makeHostConfiguration({
      workspaceRoot: tempRoot(),
      components: [onlyOne],
      useCases: [useCase],
    });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("ready");
    expect(result.coordinators.has("incompleto")).toBe(false);

    await result.core!.shutdown();
  });

  it("cancelación cooperativa antes de crear el Core produce STOPPED sin construir nada", async () => {
    let built = false;
    const descriptor = makeComponentDescriptor({ manifest: { id: "nunca" } });
    const config = makeHostConfiguration({
      workspaceRoot: tempRoot(),
      components: [
        {
          ...descriptor,
          factory: {
            build: async (deps) => {
              built = true;
              return descriptor.factory.build(deps);
            },
          },
        },
      ],
    });

    const result = await new CompositionRoot().run(config, () => true, noopHooks());

    expect(result.outcome).toBe("stopped");
    expect(result.report.cancelled).toBe(true);
    expect(built).toBe(false);
  });

  it("componentes omitidos por configuración (enabled: false) no entran en el grafo", async () => {
    const disabled = makeComponentDescriptor({ manifest: { id: "deshabilitado" }, enabled: false });
    const config = makeHostConfiguration({ workspaceRoot: tempRoot(), components: [disabled] });

    const result = await new CompositionRoot().run(config, () => false, noopHooks());

    expect(result.outcome).toBe("ready");
    expect(result.report.components).toEqual([
      { componentId: "deshabilitado", outcome: "omitted-by-configuration" },
    ]);

    await result.core!.shutdown();
  });
});
