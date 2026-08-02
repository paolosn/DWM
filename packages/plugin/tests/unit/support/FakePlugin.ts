import { Plugin } from "../../../src/Plugin.js";
import type { PluginContext } from "../../../src/PluginContext.js";
import type { PluginFactory } from "../../../src/PluginFactory.js";
import type { PluginManifest } from "../../../src/PluginManifest.js";

export interface FakePluginOptions {
  readonly healthy?: boolean;
  readonly failInstall?: boolean;
  readonly failLoad?: boolean;
  readonly failInit?: boolean;
  readonly failActivate?: boolean;
  readonly failDeactivate?: boolean;
  readonly failUnload?: boolean;
  readonly failUninstall?: boolean;
  readonly failHealthCheck?: boolean;
  onInstall?(context: PluginContext): void;
  onActivate?(context: PluginContext): void;
}

export class FakePlugin extends Plugin {
  installCount = 0;
  loadCount = 0;
  initCount = 0;
  activateCount = 0;
  deactivateCount = 0;
  unloadCount = 0;
  uninstallCount = 0;
  healthCheckCount = 0;
  lastContext?: PluginContext;

  constructor(private readonly options: FakePluginOptions = {}) {
    super();
  }

  override async onInstall(context: PluginContext): Promise<void> {
    this.installCount += 1;
    this.lastContext = context;
    this.options.onInstall?.(context);
    if (this.options.failInstall) throw new Error("fallo simulado de onInstall");
  }

  override async onLoad(context: PluginContext): Promise<void> {
    this.loadCount += 1;
    this.lastContext = context;
    if (this.options.failLoad) throw new Error("fallo simulado de onLoad");
  }

  override async onInit(context: PluginContext): Promise<void> {
    this.initCount += 1;
    this.lastContext = context;
    if (this.options.failInit) throw new Error("fallo simulado de onInit");
  }

  override async onActivate(context: PluginContext): Promise<void> {
    this.activateCount += 1;
    this.lastContext = context;
    this.options.onActivate?.(context);
    if (this.options.failActivate) throw new Error("fallo simulado de onActivate");
  }

  override async onDeactivate(): Promise<void> {
    this.deactivateCount += 1;
    if (this.options.failDeactivate) throw new Error("fallo simulado de onDeactivate");
  }

  override async onUnload(): Promise<void> {
    this.unloadCount += 1;
    if (this.options.failUnload) throw new Error("fallo simulado de onUnload");
  }

  override async onUninstall(): Promise<void> {
    this.uninstallCount += 1;
    if (this.options.failUninstall) throw new Error("fallo simulado de onUninstall");
  }

  override async checkHealth(): Promise<boolean> {
    this.healthCheckCount += 1;
    if (this.options.failHealthCheck) throw new Error("fallo simulado de checkHealth");
    return this.options.healthy ?? true;
  }
}

export function makeFactory(options: FakePluginOptions = {}): {
  factory: PluginFactory;
  plugin: FakePlugin;
} {
  const plugin = new FakePlugin(options);
  return { factory: { create: () => plugin }, plugin };
}

export function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: "sample-plugin",
    name: "Sample Plugin",
    version: "1.0.0",
    description: "Plugin de ejemplo para pruebas.",
    author: "DWM Tests",
    entryPoint: "index.js",
    minDwmVersion: "1.0.0",
    dependencies: [],
    moduleDependencies: [],
    permissions: [],
    capabilities: { provided: [] },
    ...overrides,
  };
}
