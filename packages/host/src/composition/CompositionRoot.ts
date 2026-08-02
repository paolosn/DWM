import { DWMCore, FileSystemStorageProvider, type IAdapter, type IModule } from "@dwm/core";
import type { HostConfiguration } from "../config/HostConfiguration.js";
import { validateHostConfiguration } from "../config/validateHostConfiguration.js";
import { validateManifestShape } from "../manifests/validateManifest.js";
import { planComposition, type MandatoryFailureReason } from "./CompositionPlanner.js";
import { DependencyContainer } from "./DependencyContainer.js";
import { CleanupStack, createRollbackFailedError, type CleanupFailure } from "./CleanupStack.js";
import { UseCaseCoordinator } from "../coordinators/UseCaseCoordinator.js";
import { HostErrorCode } from "../errors/HostErrorCatalog.js";
import { createHostError, HostError } from "../errors/HostError.js";
import type { ComponentBundle } from "../bundles/ComponentBundle.js";
import type { CompositionReport, ComponentReportEntry } from "../status/HostStatusReport.js";

export type CompositionOutcome = "ready" | "stopped" | "error";

export interface CompositionResult {
  readonly outcome: CompositionOutcome;
  readonly core?: DWMCore;
  readonly cleanupStack: CleanupStack;
  readonly dependencyContainer: DependencyContainer;
  readonly coordinators: ReadonlyMap<string, UseCaseCoordinator>;
  readonly bundlesById: ReadonlyMap<string, ComponentBundle>;
  readonly report: CompositionReport;
}

function mandatoryFailureErrorCode(reason: MandatoryFailureReason): HostErrorCode {
  switch (reason) {
    case "missing-dependency":
      return HostErrorCode.HOST_DEPENDENCY_MISSING;
    case "capability-unavailable":
      return HostErrorCode.HOST_CAPABILITY_UNAVAILABLE;
    case "cycle":
      return HostErrorCode.HOST_CIRCULAR_DEPENDENCY;
    case "propagated":
      return HostErrorCode.HOST_DEPENDENCY_MISSING;
  }
}

import { HostLifecycleState } from "../host/HostLifecycleState.js";

export interface CompositionHooks {
  onPhase(phase: HostLifecycleState): void;
  onCoreCreated(core: DWMCore): void;
}

/**
 * Ejecuta el orden único de inicialización, construcción y registro
 * (TDS-001 §4), aplicando cancelación cooperativa entre fases (§8.3) y
 * rollback determinista ante cualquier fallo mandatorio (§8.2).
 */
export class CompositionRoot {
  async run(
    config: HostConfiguration,
    shouldCancel: () => boolean,
    hooks: CompositionHooks
  ): Promise<CompositionResult> {
    const cleanupStack = new CleanupStack();
    const dependencyContainer = new DependencyContainer();
    const entries: ComponentReportEntry[] = [];
    const bundlesById = new Map<string, ComponentBundle>();
    const coordinators = new Map<string, UseCaseCoordinator>();
    // `core` se declara indefinido y se asigna una única vez (paso 8), pero
    // debe ser `let`: los closures de `abort` definidos más abajo lo
    // capturan por referencia antes de esa asignación, para poder ver su
    // valor una vez exista.
    // eslint-disable-next-line prefer-const
    let core: DWMCore | undefined;
    let coreInitialized = false;

    const abort = async (
      originalError: HostError,
      cancelled: boolean
    ): Promise<CompositionResult> => {
      const cleanupFailures: CleanupFailure[] = [];

      if (core && coreInitialized) {
        const coreShutdown = await core.shutdown();
        for (const failure of coreShutdown.failures) {
          cleanupFailures.push({
            kind: "component",
            id: failure.id,
            error: HostError.wrap(failure.error, {
              code:
                failure.kind === "module"
                  ? HostErrorCode.HOST_MODULE_REGISTRATION_FAILED
                  : HostErrorCode.HOST_ADAPTER_REGISTRATION_FAILED,
              origin: "rollback",
              recoverable: true,
              message: `dispose() falló para "${failure.id}" durante el rollback del Core.`,
            }),
          });
          entries.push({
            componentId: failure.id,
            outcome: "rollback-performed",
            detail: "dispose() falló durante el apagado del Core en el rollback.",
          });
        }
      }

      const stackResult = await cleanupStack.unwind();
      cleanupFailures.push(...stackResult.failures);

      const reportedComponentIds = new Set(entries.map((e) => e.componentId));
      for (const failure of cleanupFailures) {
        if (failure.kind === "component" && !reportedComponentIds.has(failure.id)) {
          entries.push({
            componentId: failure.id,
            outcome: "rollback-performed",
            detail: failure.error.message,
          });
          reportedComponentIds.add(failure.id);
        }
      }

      const rollbackAggregateError =
        cleanupFailures.length > 0 ? createRollbackFailedError(cleanupFailures) : undefined;

      const report: CompositionReport = {
        components: entries,
        originalError,
        rollbackFailures: cleanupFailures,
        ...(rollbackAggregateError ? { rollbackAggregateError } : {}),
        cancelled,
      };

      const outcome: CompositionOutcome =
        cancelled && cleanupFailures.length === 0 ? "stopped" : "error";

      return {
        outcome,
        cleanupStack,
        dependencyContainer,
        coordinators,
        bundlesById,
        report,
      };
    };

    // Paso 1: crear y validar HostConfiguration.
    try {
      validateHostConfiguration(config);
    } catch (err) {
      return abort(
        HostError.wrap(err, {
          code: HostErrorCode.HOST_INVALID_CONFIGURATION,
          origin: "configuration",
          recoverable: false,
        }),
        false
      );
    }

    // Pasos 2-3: cargar y validar manifiestos.
    const enabledDescriptors = config.components.filter((d) => d.enabled);
    for (const descriptor of config.components) {
      if (!descriptor.enabled) {
        entries.push({ componentId: descriptor.manifest.id, outcome: "omitted-by-configuration" });
        continue;
      }
      try {
        validateManifestShape(descriptor.manifest);
      } catch (err) {
        return abort(
          HostError.wrap(err, {
            code: HostErrorCode.HOST_INVALID_MANIFEST,
            origin: "manifest",
            recoverable: true,
          }),
          false
        );
      }
    }

    if (shouldCancel()) return abort(this.cancellationError(), true);

    // Pasos 4-6: grafo de dependencias, detección de problemas, orden topológico.
    const manifests = enabledDescriptors.map((d) => d.manifest);
    const availableDependencyNames = new Set(Object.keys(config.dependencyProviders));
    const plan = planComposition(manifests, availableDependencyNames);

    if (plan.mandatoryFailures.length > 0) {
      const first = plan.mandatoryFailures[0]!;
      const error = createHostError({
        code: mandatoryFailureErrorCode(first.reason),
        message: first.detail,
        origin: "composition",
        recoverable: false,
      });
      return abort(error, false);
    }

    for (const [componentId, reason] of plan.omitted) {
      entries.push({
        componentId,
        outcome: reason === "omitted-by-cycle" ? "omitted-by-cycle" : "omitted-by-dependency",
      });
    }

    if (shouldCancel()) return abort(this.cancellationError(), true);

    // Paso 7: crear el StorageProvider requerido por DWMCore.
    hooks.onPhase(HostLifecycleState.INITIALIZING_CORE);
    const storage = new FileSystemStorageProvider(config.workspaceRoot);

    // Paso 8: crear DWMCore.
    core = new DWMCore();
    hooks.onCoreCreated(core);

    // Paso 9: inicializar DWMCore.
    try {
      await core.initialize({ storage });
      coreInitialized = true;
    } catch (err) {
      return abort(
        HostError.wrap(err, {
          code: HostErrorCode.HOST_CORE_INITIALIZATION_FAILED,
          origin: "core-bridge",
          recoverable: false,
        }),
        false
      );
    }

    if (shouldCancel()) return abort(this.cancellationError(), true);

    // Paso 10: construir las dependencias externas del host.
    hooks.onPhase(HostLifecycleState.BUILDING_COMPONENTS);
    for (const name of availableDependencyNames) {
      try {
        const resolved = await config.dependencyProviders[name]!();
        dependencyContainer.set(name, resolved);
        if (resolved.dispose) {
          cleanupStack.push({
            kind: "external-dependency",
            id: name,
            dispose: () => resolved.dispose!(),
          });
        }
      } catch (err) {
        return abort(
          HostError.wrap(err, {
            code: HostErrorCode.HOST_DEPENDENCY_MISSING,
            origin: "composition",
            recoverable: false,
            message: `Fallo al construir la dependencia externa "${name}".`,
          }),
          false
        );
      }
    }

    // Paso 11: construir módulos y adaptadores, en el orden ya validado.
    const descriptorById = new Map(enabledDescriptors.map((d) => [d.manifest.id, d]));
    for (const componentId of plan.order) {
      const descriptor = descriptorById.get(componentId)!;
      const dependencies = dependencyContainer.resolveFor(descriptor.manifest.requiredDependencies);
      let bundle: ComponentBundle;
      try {
        bundle = await descriptor.factory.build(dependencies);
      } catch (err) {
        const code =
          descriptor.manifest.kind === "module"
            ? HostErrorCode.HOST_MODULE_CONSTRUCTION_FAILED
            : HostErrorCode.HOST_ADAPTER_CONSTRUCTION_FAILED;
        const wrapped = HostError.wrap(err, {
          code,
          origin: "construction",
          recoverable: true,
          message: `Fallo al construir el componente "${componentId}".`,
        });
        if (descriptor.manifest.mandatory) {
          return abort(wrapped, false);
        }
        entries.push({ componentId, outcome: "construction-failed", detail: wrapped.message });
        continue;
      }

      bundlesById.set(componentId, bundle);
      cleanupStack.push({
        kind: "component",
        id: componentId,
        dispose: async () => {
          if (bundle.lifecycle.dispose) await bundle.lifecycle.dispose();
        },
      });
    }

    if (shouldCancel()) return abort(this.cancellationError(), true);

    // Paso 12: registrar módulos y adaptadores.
    hooks.onPhase(HostLifecycleState.REGISTERING_COMPONENTS);
    for (const componentId of plan.order) {
      const bundle = bundlesById.get(componentId);
      if (!bundle) continue; // construcción opcional que falló (ya reportada arriba).
      const descriptor = descriptorById.get(componentId)!;
      try {
        if (descriptor.manifest.kind === "module") {
          await core.registerModule(bundle.lifecycle as IModule);
        } else {
          await core.registerAdapter(bundle.lifecycle as IAdapter);
        }
        cleanupStack.discard("component", componentId);
        entries.push({ componentId, outcome: "registered" });
      } catch (err) {
        const code =
          descriptor.manifest.kind === "module"
            ? HostErrorCode.HOST_MODULE_REGISTRATION_FAILED
            : HostErrorCode.HOST_ADAPTER_REGISTRATION_FAILED;
        const wrapped = HostError.wrap(err, {
          code,
          origin: "registration",
          recoverable: true,
          message: `Fallo al registrar el componente "${componentId}".`,
        });
        if (descriptor.manifest.mandatory) {
          return abort(wrapped, false);
        }
        entries.push({ componentId, outcome: "registration-failed", detail: wrapped.message });
      }
    }

    // Paso 13: construir los coordinadores de casos de uso.
    for (const useCase of config.useCases) {
      const surfaces: Record<string, unknown> = {};
      let allAvailable = true;
      for (const requiredId of useCase.requiredComponentIds) {
        const bundle = bundlesById.get(requiredId);
        if (!bundle) {
          allAvailable = false;
          break;
        }
        surfaces[requiredId] = bundle.domainSurface;
      }
      if (allAvailable) {
        coordinators.set(useCase.id, new UseCaseCoordinator(useCase.id, surfaces, useCase.handle));
      }
    }

    if (shouldCancel()) return abort(this.cancellationError(), true);

    return {
      outcome: "ready",
      core,
      cleanupStack,
      dependencyContainer,
      coordinators,
      bundlesById,
      report: { components: entries, rollbackFailures: [], cancelled: false },
    };
  }

  private cancellationError(): HostError {
    return createHostError({
      code: HostErrorCode.HOST_COMPOSITION_CANCELLED,
      message: "Se solicitó el apagado del host durante la inicialización.",
      origin: "composition",
      recoverable: true,
    });
  }
}
