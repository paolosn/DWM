import type { BackupRequest } from "../../../src/BackupRequest.js";

export function makeRequest(overrides: Partial<BackupRequest> = {}): BackupRequest {
  return {
    type: "full",
    resources: [{ resourceType: "custom", resourceId: "r1" }],
    target: { providerId: "local", path: "dest" },
    ...overrides,
  };
}
