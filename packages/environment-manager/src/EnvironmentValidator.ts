import { VersionComparator } from "./VersionComparator.js";
import type {
  EnvironmentRequirement,
  EnvironmentValidationResult,
  RequirementCheckResult,
  ToolResult,
} from "./EnvironmentTypes.js";

/**
 * Valida una lista de `EnvironmentRequirement` definidos por el
 * consumidor contra los resultados de la última detección. Cada
 * resultado individual (`satisfied`) refleja el hecho objetivo —
 * ¿está disponible y cumple la versión mínima, si se pidió?—
 * independientemente de si el requisito es obligatorio; `valid` en el
 * resultado global solo tiene en cuenta los requisitos marcados como
 * obligatorios (`required !== false`).
 */
export class EnvironmentValidator {
  private readonly comparator = new VersionComparator();

  validate(
    requirements: readonly EnvironmentRequirement[],
    tools: readonly ToolResult[]
  ): EnvironmentValidationResult {
    const results = requirements.map((requirement) => this.checkOne(requirement, tools));
    const valid = results.every((result) => !result.required || result.satisfied);
    return { valid, results };
  }

  private checkOne(
    requirement: EnvironmentRequirement,
    tools: readonly ToolResult[]
  ): RequirementCheckResult {
    const required = requirement.required ?? true;
    const tool = tools.find((candidate) => candidate.id === requirement.toolId);

    if (!tool) {
      return {
        toolId: requirement.toolId,
        satisfied: false,
        required,
        status: "missing",
        ...(requirement.minVersion ? { minVersion: requirement.minVersion } : {}),
        message: `No hay ningún resultado de detección para "${requirement.toolId}".`,
      };
    }

    if (tool.status !== "available") {
      return {
        toolId: requirement.toolId,
        satisfied: false,
        required,
        status: tool.status,
        ...(requirement.minVersion ? { minVersion: requirement.minVersion } : {}),
        message: `"${tool.name}" no está disponible (${tool.status}).`,
      };
    }

    if (requirement.minVersion && tool.version) {
      const satisfiesMin = this.comparator.satisfiesMinimum(tool.version, requirement.minVersion);
      return {
        toolId: requirement.toolId,
        satisfied: satisfiesMin,
        required,
        status: tool.status,
        foundVersion: tool.version.raw,
        minVersion: requirement.minVersion,
        ...(satisfiesMin
          ? {}
          : {
              message: `"${tool.name}" está en la versión ${tool.version.raw}, por debajo de la mínima requerida ${requirement.minVersion}.`,
            }),
      };
    }

    return {
      toolId: requirement.toolId,
      satisfied: true,
      required,
      status: tool.status,
      ...(tool.version ? { foundVersion: tool.version.raw } : {}),
    };
  }
}
