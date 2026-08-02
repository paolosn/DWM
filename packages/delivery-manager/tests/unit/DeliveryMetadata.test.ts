import { describe, it, expect } from "vitest";
import {
  archiveDeliveryDwmMetadata,
  createInitialDeliveryDwmMetadata,
  touchDeliveryDwmMetadata,
} from "../../src/DeliveryMetadata.js";

describe("DeliveryMetadata", () => {
  it("createInitialDeliveryDwmMetadata() crea un bloque no archivado con createdAt === updatedAt", () => {
    const metadata = createInitialDeliveryDwmMetadata();
    expect(metadata.archived).toBe(false);
    expect(metadata.archivedAt).toBeUndefined();
    expect(metadata.createdAt).toBe(metadata.updatedAt);
  });

  it("touchDeliveryDwmMetadata() refresca updatedAt preservando el resto", async () => {
    const initial = createInitialDeliveryDwmMetadata();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const touched = touchDeliveryDwmMetadata(initial);
    expect(touched.createdAt).toBe(initial.createdAt);
    expect(touched.archived).toBe(false);
    expect(new Date(touched.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(initial.updatedAt).getTime()
    );
  });

  it("archiveDeliveryDwmMetadata() marca archived y fija archivedAt", () => {
    const initial = createInitialDeliveryDwmMetadata();
    const archived = archiveDeliveryDwmMetadata(initial);
    expect(archived.archived).toBe(true);
    expect(archived.archivedAt).toBeDefined();
  });

  it("archiveDeliveryDwmMetadata() es idempotente respecto de archivedAt ya existente", () => {
    const initial = createInitialDeliveryDwmMetadata();
    const archivedOnce = archiveDeliveryDwmMetadata(initial);
    const archivedTwice = archiveDeliveryDwmMetadata(archivedOnce);
    expect(archivedTwice.archivedAt).toBe(archivedOnce.archivedAt);
  });
});
