import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type {
  HostConfiguration,
  ComponentDescriptor,
  UseCaseDescriptor,
} from "../../src/config/HostConfiguration.js";
import type { DependencyProvider } from "../../src/contracts/DependencyProvider.js";

export function makeTempWorkspace(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "dwm-host-test-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function makeHostConfiguration(overrides: {
  workspaceRoot: string;
  components?: readonly ComponentDescriptor[];
  dependencyProviders?: Readonly<Record<string, DependencyProvider>>;
  useCases?: readonly UseCaseDescriptor[];
}): HostConfiguration {
  return {
    workspaceRoot: overrides.workspaceRoot,
    components: overrides.components ?? [],
    dependencyProviders: overrides.dependencyProviders ?? {},
    useCases: overrides.useCases ?? [],
  };
}
