import type { ToolCapabilities } from "../../../src/ToolCapabilities.js";

export interface FakeAdapterRecord {
  capabilities: ToolCapabilities;
  healthy: boolean;
  failInit?: boolean;
  failActivate?: boolean;
  failDeactivate?: boolean;
  failReload?: boolean;
  failHealthCheck?: boolean;
}

/**
 * Doble de `AdapterManager` (de @dwm/adapters) que expone exactamente la
 * superficie que `ToolingManager` consume, permitiendo controlar el
 * comportamiento de cada adaptador simulado sin depender del paquete real.
 */
export class FakeAdapterManager {
  private readonly adapters = new Map<string, FakeAdapterRecord>();
  readonly calls: string[] = [];

  addAdapter(id: string, record: Partial<FakeAdapterRecord> = {}): void {
    this.adapters.set(id, {
      capabilities: record.capabilities ?? { provided: [], required: [] },
      healthy: record.healthy ?? true,
      ...(record.failInit !== undefined ? { failInit: record.failInit } : {}),
      ...(record.failActivate !== undefined ? { failActivate: record.failActivate } : {}),
      ...(record.failDeactivate !== undefined ? { failDeactivate: record.failDeactivate } : {}),
      ...(record.failReload !== undefined ? { failReload: record.failReload } : {}),
      ...(record.failHealthCheck !== undefined ? { failHealthCheck: record.failHealthCheck } : {}),
    });
  }

  discoverAdapters(): string[] {
    return [...this.adapters.keys()].sort();
  }

  getCapabilities(id: string): ToolCapabilities | undefined {
    return this.adapters.get(id)?.capabilities;
  }

  async initializeAdapter(id: string): Promise<void> {
    this.calls.push(`init:${id}`);
    if (this.adapters.get(id)?.failInit) throw new Error(`fallo simulado de init para ${id}`);
  }

  async activateAdapter(id: string): Promise<void> {
    this.calls.push(`activate:${id}`);
    if (this.adapters.get(id)?.failActivate)
      throw new Error(`fallo simulado de activate para ${id}`);
  }

  async deactivateAdapter(id: string): Promise<void> {
    this.calls.push(`deactivate:${id}`);
    if (this.adapters.get(id)?.failDeactivate)
      throw new Error(`fallo simulado de deactivate para ${id}`);
  }

  async reloadAdapter(id: string): Promise<void> {
    this.calls.push(`reload:${id}`);
    if (this.adapters.get(id)?.failReload) throw new Error(`fallo simulado de reload para ${id}`);
  }

  async checkHealth(
    id: string
  ): Promise<{ adapterId: string; healthy: boolean; checkedAt: string; detail?: string }> {
    const record = this.adapters.get(id);
    if (record?.failHealthCheck) throw new Error(`fallo simulado de checkHealth para ${id}`);
    return { adapterId: id, healthy: record?.healthy ?? true, checkedAt: new Date().toISOString() };
  }
}
