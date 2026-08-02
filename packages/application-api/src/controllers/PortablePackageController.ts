import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import {
  asRecord,
  assertSafeOptionalPath,
  optionalString,
  requireString,
} from "../payloadHelpers.js";
import type {
  CreatePackageResult,
  PackageManifest,
  PackageValidationResult,
  PackageZipEntryInfo,
} from "@dwm/portable-package-manager";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "packages.create": {
      payload: { destinationZipPath: string; root?: string };
      result: CreatePackageResult;
    };
    "packages.inspect": { payload: { zipPath: string }; result: PackageManifest };
    "packages.list-contents": {
      payload: { zipPath: string };
      result: readonly PackageZipEntryInfo[];
    };
    "packages.validate": { payload: { zipPath: string }; result: PackageValidationResult };
  }
}

/** Módulo 31 — controlador del recurso `packages`, delega exclusivamente en `@dwm/portable-package-manager`. */
export class PortablePackageController implements ApplicationController {
  readonly resource = "packages";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () =>
      requireDependency(this.context.portablePackageManager, "portable-package-manager");

    permissions.register("packages.create", ["export"], { destructive: true });
    operations.register({
      name: "packages.create",
      version: "1.0.0",
      capabilities: ["export"],
      destructive: true,
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const destinationZipPath = requireString(record, "destinationZipPath");
        assertSafeOptionalPath(record, "destinationZipPath", { allowAbsolute: true });
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { destinationZipPath, root: optionalString(record, "root") };
      },
      handler: async (payload) =>
        manager().createPackage({
          destinationZipPath: payload.destinationZipPath,
          ...(payload.root ? { root: payload.root } : {}),
        }),
    });

    permissions.register("packages.inspect", ["read"]);
    operations.register({
      name: "packages.inspect",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const zipPath = requireString(record, "zipPath");
        assertSafeOptionalPath(record, "zipPath", { allowAbsolute: true });
        return { zipPath };
      },
      handler: async (payload) => manager().inspectManifest(payload.zipPath),
    });

    permissions.register("packages.list-contents", ["read"]);
    operations.register({
      name: "packages.list-contents",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const zipPath = requireString(record, "zipPath");
        assertSafeOptionalPath(record, "zipPath", { allowAbsolute: true });
        return { zipPath };
      },
      handler: async (payload) => manager().listPackageContents(payload.zipPath),
    });

    permissions.register("packages.validate", ["read"]);
    operations.register({
      name: "packages.validate",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const zipPath = requireString(record, "zipPath");
        assertSafeOptionalPath(record, "zipPath", { allowAbsolute: true });
        return { zipPath };
      },
      handler: async (payload) => manager().validatePackage(payload.zipPath),
    });
  }
}
