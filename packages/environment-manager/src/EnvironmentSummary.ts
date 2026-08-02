import type {
  EnvironmentCapabilities,
  EnvironmentPlatformInfo,
  EnvironmentSummary,
  EnvironmentWarning,
  ToolResult,
} from "./EnvironmentTypes.js";

function findTool(tools: readonly ToolResult[], id: string): ToolResult | undefined {
  return tools.find((tool) => tool.id === id);
}

function isAvailable(tools: readonly ToolResult[], id: string): boolean {
  return findTool(tools, id)?.status === "available";
}

function buildCapabilities(tools: readonly ToolResult[]): EnvironmentCapabilities {
  return {
    containerRuntime: isAvailable(tools, "docker"),
    nodeJavaScript: isAvailable(tools, "node"),
    pythonRuntime: isAvailable(tools, "python"),
    phpRuntime: isAvailable(tools, "php"),
  };
}

function buildWarnings(tools: readonly ToolResult[]): EnvironmentWarning[] {
  const warnings: EnvironmentWarning[] = [];
  for (const tool of tools) {
    if (tool.status === "invalid") {
      warnings.push({
        code: `tool-invalid:${tool.id}`,
        message: `"${tool.name}" se detectó pero no se pudo ejecutar correctamente (${tool.reason ?? "motivo desconocido"}).`,
        toolId: tool.id,
      });
    }
  }
  return warnings;
}

/**
 * Construye el `EnvironmentSummary` completo a partir de la
 * información de plataforma y los resultados de detección ya
 * obtenidos. Función pura: no inspecciona nada por sí misma, solo
 * agrega lo que ya se detectó.
 */
export function buildEnvironmentSummary(
  platformInfo: EnvironmentPlatformInfo,
  tools: readonly ToolResult[],
  durationMs: number
): EnvironmentSummary {
  const availableCount = tools.filter(
    (tool) => tool.status === "available" || tool.status === "available-without-cli"
  ).length;
  const missingCount = tools.filter((tool) => tool.status === "missing").length;
  const invalidCount = tools.filter((tool) => tool.status === "invalid").length;
  const unsupportedCount = tools.filter((tool) => tool.status === "unsupported").length;

  return {
    platformInfo,
    tools,
    capabilities: buildCapabilities(tools),
    warnings: buildWarnings(tools),
    availableCount,
    missingCount,
    invalidCount,
    unsupportedCount,
    generatedAt: new Date().toISOString(),
    durationMs,
  };
}
