import { BaseAdapter } from "../../../src/BaseAdapter.js";
import { AdapterSubject } from "../../../src/AdapterSubject.js";
import type { AdapterCapabilities } from "../../../src/AdapterCapabilities.js";
import type { AdapterContext } from "../../../src/AdapterContext.js";

export interface FakeAdapterOptions {
  readonly id?: string;
  readonly subject?: AdapterSubject;
  readonly capabilities?: AdapterCapabilities;
  readonly healthy?: boolean;
  readonly failInit?: boolean;
  readonly failActivate?: boolean;
  readonly failDeactivate?: boolean;
  readonly failDispose?: boolean;
  readonly failHealthCheck?: boolean;
  onInit?(context: AdapterContext): void;
  onActivateCalled?(context: AdapterContext): void;
}

export class FakeAdapter extends BaseAdapter {
  readonly id: string;
  readonly subject: AdapterSubject;
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  initCount = 0;
  activateCount = 0;
  deactivateCount = 0;
  disposeCount = 0;
  healthCheckCount = 0;
  lastContext?: AdapterContext;

  constructor(private readonly options: FakeAdapterOptions = {}) {
    super();
    this.id = options.id ?? "fake-adapter";
    this.subject = options.subject ?? AdapterSubject.GIT;
  }

  override get capabilities(): AdapterCapabilities {
    return this.options.capabilities ?? { provided: [], required: [] };
  }

  override async onInit(context: AdapterContext): Promise<void> {
    this.initCount += 1;
    this.lastContext = context;
    this.options.onInit?.(context);
    if (this.options.failInit) throw new Error("fallo simulado de init");
  }

  override async onActivate(context: AdapterContext): Promise<void> {
    this.activateCount += 1;
    this.options.onActivateCalled?.(context);
    if (this.options.failActivate) throw new Error("fallo simulado de activate");
  }

  override async onDeactivate(): Promise<void> {
    this.deactivateCount += 1;
    if (this.options.failDeactivate) throw new Error("fallo simulado de deactivate");
  }

  override async onDispose(): Promise<void> {
    this.disposeCount += 1;
    if (this.options.failDispose) throw new Error("fallo simulado de dispose");
  }

  override async checkHealth(): Promise<boolean> {
    this.healthCheckCount += 1;
    if (this.options.failHealthCheck) throw new Error("fallo simulado de health check");
    return this.options.healthy ?? true;
  }
}
