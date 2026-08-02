import { describe, it, expect } from "vitest";
import { ClientMetadataService } from "../../src/ClientMetadata.js";

describe("ClientMetadataService", () => {
  const service = new ClientMetadataService();

  it("createInitial crea metadatos por defecto sin archivar", () => {
    const metadata = service.createInitial();
    expect(metadata.archived).toBe(false);
    expect(metadata.createdAt).toBe(metadata.updatedAt);
    expect(metadata.archivedAt).toBeUndefined();
  });

  it("withTouchedTimestamp actualiza únicamente updatedAt", async () => {
    const initial = service.createInitial();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const touched = service.withTouchedTimestamp(initial);
    expect(touched.createdAt).toBe(initial.createdAt);
    expect(new Date(touched.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(initial.updatedAt).getTime()
    );
  });

  it("withArchived / withRestored alternan el ciclo de vida", () => {
    const initial = service.createInitial();
    const archived = service.withArchived(initial);
    expect(archived.archived).toBe(true);
    expect(typeof archived.archivedAt).toBe("string");

    const restored = service.withRestored(archived);
    expect(restored.archived).toBe(false);
    expect(restored.archivedAt).toBeUndefined();
  });

  it("fromFallback construye metadatos por defecto a partir de fechas de respaldo", () => {
    const stat = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" };
    const metadata = service.fromFallback(stat);
    expect(metadata.archived).toBe(false);
    expect(metadata.createdAt).toBe(stat.createdAt);
    expect(metadata.updatedAt).toBe(stat.updatedAt);
  });
});
