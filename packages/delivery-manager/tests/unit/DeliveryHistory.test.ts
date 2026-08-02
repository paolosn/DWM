import { describe, it, expect } from "vitest";
import { DeliveryHistory } from "../../src/DeliveryHistory.js";
import { createInitialDeliveryDwmMetadata } from "../../src/DeliveryMetadata.js";
import { DeliveryErrorCode } from "../../src/errors/DeliveryErrorCode.js";
import type { DeliveryRecord } from "../../src/DeliveryTypes.js";

function makeRecord(overrides: Partial<DeliveryRecord>): DeliveryRecord {
  return {
    id: "id",
    projectId: "proyecto-1",
    folderName: "folder",
    label: "label",
    type: "folder",
    state: "active",
    origin: "/tmp/origen",
    hash: "hash",
    sizeBytes: 100,
    fileCount: 3,
    directoryCount: 1,
    deliveredAt: "2026-08-01T00:00:00.000Z",
    importedAt: "2026-08-01T00:00:00.000Z",
    dwm: createInitialDeliveryDwmMetadata(),
    ...overrides,
  };
}

describe("DeliveryHistory", () => {
  const history = new DeliveryHistory();

  it("order() ordena ascendentemente por fecha de entrega y, en empate, por fecha de importación", () => {
    const a = makeRecord({ id: "a", deliveredAt: "2026-08-15T00:00:00.000Z" });
    const b = makeRecord({ id: "b", deliveredAt: "2026-08-01T00:00:00.000Z" });
    const c = makeRecord({
      id: "c",
      deliveredAt: "2026-08-01T00:00:00.000Z",
      importedAt: "2026-08-02T00:00:00.000Z",
    });
    const ordered = history.order([a, b, c]);
    expect(ordered.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("findActive() devuelve la más reciente entre las active, y undefined si ninguna lo está", () => {
    const first = makeRecord({
      id: "first",
      deliveredAt: "2026-08-01T00:00:00.000Z",
      state: "superseded",
    });
    const second = makeRecord({
      id: "second",
      deliveredAt: "2026-08-15T00:00:00.000Z",
      state: "active",
    });
    expect(history.findActive([first, second])?.id).toBe("second");
    expect(
      history.findActive([makeRecord({ id: "archivada", state: "archived" })])
    ).toBeUndefined();
  });

  it("findLast() devuelve la más reciente sin importar el estado", () => {
    const first = makeRecord({ id: "first", deliveredAt: "2026-08-01T00:00:00.000Z" });
    const second = makeRecord({
      id: "second",
      deliveredAt: "2026-08-15T00:00:00.000Z",
      state: "archived",
    });
    expect(history.findLast([first, second])?.id).toBe("second");
  });

  it("findById() encuentra por id y devuelve undefined si no existe", () => {
    const record = makeRecord({ id: "x" });
    expect(history.findById([record], "x")).toBe(record);
    expect(history.findById([record], "y")).toBeUndefined();
  });

  it("supersedePreviousActive() solo transforma las entregas active en superseded", () => {
    const active = makeRecord({ id: "active-1", state: "active" });
    const archived = makeRecord({ id: "archived-1", state: "archived" });
    const results = history.supersedePreviousActive([active, archived]);
    expect(results[0]?.state).toBe("superseded");
    expect(results[0]?.id).toBe("active-1");
    expect(history.supersedePreviousActive([archived])).toHaveLength(0);
  });

  it("archive() marca una entrega como archivada y aplica notas opcionales", () => {
    const record = makeRecord({ id: "x" });
    const archived = history.archive(record, "cerrada tras validación del cliente");
    expect(archived.state).toBe("archived");
    expect(archived.dwm.archived).toBe(true);
    expect(archived.notes).toBe("cerrada tras validación del cliente");
  });

  it("archive() lanza si la entrega ya estaba archivada", () => {
    const record = makeRecord({
      id: "x",
      state: "archived",
      dwm: { ...createInitialDeliveryDwmMetadata(), archived: true },
    });
    expect(() => history.archive(record)).toThrow(
      expect.objectContaining({ code: DeliveryErrorCode.DELIVERY_ALREADY_ARCHIVED })
    );
  });

  it("compare() calcula coincidencia de hash y deltas de tamaño/ficheros/carpetas", () => {
    const a = makeRecord({ id: "a", hash: "h1", sizeBytes: 100, fileCount: 3, directoryCount: 1 });
    const b = makeRecord({ id: "b", hash: "h2", sizeBytes: 150, fileCount: 4, directoryCount: 2 });
    const result = history.compare(a, b);
    expect(result.hashMatch).toBe(false);
    expect(result.sizeDeltaBytes).toBe(50);
    expect(result.fileCountDelta).toBe(1);
    expect(result.directoryCountDelta).toBe(1);
  });

  it("toSummary() incluye version solo cuando está presente y marca active según activeId", () => {
    const withVersion = makeRecord({ id: "a", version: "1.0.0" });
    const withoutVersion = makeRecord({ id: "b" });
    expect(history.toSummary(withVersion, "a").active).toBe(true);
    expect(history.toSummary(withVersion, "a").version).toBe("1.0.0");
    expect(history.toSummary(withoutVersion, "a").active).toBe(false);
    expect(history.toSummary(withoutVersion, "a")).not.toHaveProperty("version");
    expect(history.toSummary(withoutVersion).active).toBe(true);
  });
});
