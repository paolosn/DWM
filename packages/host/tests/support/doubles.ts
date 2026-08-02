import type { ComponentManifest } from "../../src/manifests/ComponentManifest.js";
import type { ComponentDescriptor, UseCaseDescriptor } from "../../src/config/HostConfiguration.js";
import type { ComponentBundle } from "../../src/bundles/ComponentBundle.js";
import type { DependencyProvider } from "../../src/contracts/DependencyProvider.js";
import type { IModule, IAdapter } from "@dwm/core";

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function makeManifest(overrides: Partial<ComponentManifest> = {}): ComponentManifest {
  const kind = overrides.kind ?? "module";
  const manifest: ComponentManifest = {
    id: overrides.id ?? unique("component"),
    kind,
    version: overrides.version ?? "1.0.0",
    contractVersion: overrides.contractVersion ?? "1.0.0",
    manifestVersion: overrides.manifestVersion ?? "1.0.0",
    mandatory: overrides.mandatory ?? false,
    providedCapabilities: overrides.providedCapabilities ?? [],
    requiredCapabilities: overrides.requiredCapabilities ?? [],
    requiredDependencies: overrides.requiredDependencies ?? [],
  };
  if (kind === "adapter") {
    return { ...manifest, subjectId: overrides.subjectId ?? unique("subject") };
  }
  return manifest;
}

export interface MakeComponentOptions {
  readonly manifest?: Partial<ComponentManifest>;
  readonly enabled?: boolean;
  readonly domainSurface?: unknown;
  readonly onInit?: () => Promise<void> | void;
  readonly onDispose?: () => Promise<void> | void;
  readonly buildShouldFail?: boolean;
  readonly registerShouldFail?: boolean;
}

/**
 * Fabrica un `ComponentDescriptor` de prueba completo (manifiesto + fábrica
 * doble), sin depender de ningún módulo o adaptador real (ninguno existe
 * todavía).
 */
export function makeComponentDescriptor(options: MakeComponentOptions = {}): ComponentDescriptor {
  const manifest = makeManifest(options.manifest);

  const lifecycle: IModule | IAdapter =
    manifest.kind === "module"
      ? {
          id: manifest.id,
          version: manifest.version,
          contractVersion: manifest.contractVersion,
          init: async () => {
            await options.onInit?.();
            if (options.registerShouldFail) {
              throw new Error(
                `fallo simulado de init() para forzar registro fallido de "${manifest.id}"`
              );
            }
          },
          dispose: async () => {
            await options.onDispose?.();
          },
        }
      : {
          id: manifest.id,
          subjectId: manifest.subjectId!,
          version: manifest.version,
          contractVersion: manifest.contractVersion,
          init: async () => {
            await options.onInit?.();
            if (options.registerShouldFail) {
              throw new Error(
                `fallo simulado de init() para forzar registro fallido de "${manifest.id}"`
              );
            }
          },
          dispose: async () => {
            await options.onDispose?.();
          },
        };

  return {
    manifest,
    enabled: options.enabled ?? true,
    factory: {
      build: async (_dependencies) => {
        if (options.buildShouldFail) {
          throw new Error(`fallo simulado de build() para "${manifest.id}"`);
        }
        const bundle: ComponentBundle = {
          lifecycle,
          domainSurface: options.domainSurface ?? {},
          manifest,
        };
        return bundle;
      },
    },
  };
}

export function makeUseCase(overrides: Partial<UseCaseDescriptor> = {}): UseCaseDescriptor {
  return {
    id: overrides.id ?? unique("use-case"),
    requiredComponentIds: overrides.requiredComponentIds ?? [],
    handle: overrides.handle ?? (async (_surfaces, input) => input),
  };
}

export function makeDependencyProvider<T>(
  value: T,
  options: { dispose?: () => Promise<void>; fail?: boolean } = {}
): DependencyProvider<T> {
  return async () => {
    if (options.fail) {
      throw new Error("fallo simulado al construir la dependencia externa");
    }
    return options.dispose ? { value, dispose: options.dispose } : { value };
  };
}
