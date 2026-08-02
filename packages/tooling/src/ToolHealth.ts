export interface ToolHealth {
  readonly toolId: string;
  readonly healthy: boolean;
  readonly checkedAt: string;
  readonly detail?: string;
}

export function makeToolHealth(toolId: string, healthy: boolean, detail?: string): ToolHealth {
  return {
    toolId,
    healthy,
    checkedAt: new Date().toISOString(),
    ...(detail !== undefined ? { detail } : {}),
  };
}
