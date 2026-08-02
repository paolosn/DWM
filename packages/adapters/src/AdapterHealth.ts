export interface AdapterHealth {
  readonly adapterId: string;
  readonly healthy: boolean;
  readonly checkedAt: string;
  readonly detail?: string;
}

export function makeHealth(adapterId: string, healthy: boolean, detail?: string): AdapterHealth {
  return {
    adapterId,
    healthy,
    checkedAt: new Date().toISOString(),
    ...(detail !== undefined ? { detail } : {}),
  };
}
