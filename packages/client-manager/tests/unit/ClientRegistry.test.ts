import { describe, it, expect, beforeEach } from "vitest";
import { ClientRegistry } from "../../src/ClientRegistry.js";
import { ClientError } from "../../src/errors/ClientError.js";
import { ClientErrorCode } from "../../src/errors/ClientErrorCode.js";
import type { ClientSummary } from "../../src/ClientTypes.js";

function summary(overrides: Partial<ClientSummary> = {}): ClientSummary {
  return {
    id: "mci-finance",
    name: "MCI Finance",
    slug: "mci-finance",
    status: "active",
    tags: [],
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ClientRegistry", () => {
  let registry: ClientRegistry;

  beforeEach(() => {
    registry = new ClientRegistry();
  });

  it("set/get/has/delete", () => {
    registry.set(summary());
    expect(registry.has("mci-finance")).toBe(true);
    expect(registry.get("mci-finance")?.id).toBe("mci-finance");
    registry.delete("mci-finance");
    expect(registry.has("mci-finance")).toBe(false);
  });

  it("require lanza CLIENT_NOT_FOUND si no está indexado", () => {
    expect(() => registry.require("no-existe")).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_NOT_FOUND })
    );
    expect(() => registry.require("no-existe")).toThrowError(ClientError);
  });

  it("replaceAll sustituye por completo el índice", () => {
    registry.set(summary({ id: "a", slug: "a" }));
    registry.replaceAll([summary({ id: "b", slug: "b" }), summary({ id: "c", slug: "c" })]);
    expect(registry.list().map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("list ordena por id", () => {
    registry.replaceAll([summary({ id: "z", slug: "z" }), summary({ id: "a", slug: "a" })]);
    expect(registry.list().map((s) => s.id)).toEqual(["a", "z"]);
  });

  describe("findBySlug", () => {
    beforeEach(() => {
      registry.replaceAll([
        summary({ id: "a", slug: "mci-finance" }),
        summary({ id: "b", slug: "otro-cliente" }),
      ]);
    });

    it("encuentra por slug sin distinguir mayúsculas", () => {
      expect(registry.findBySlug("mci-finance")?.id).toBe("a");
      expect(registry.findBySlug("MCI-FINANCE")?.id).toBe("a");
      expect(registry.findBySlug("no-existe")).toBeUndefined();
    });

    it("excluye el id indicado (para permitir editar el propio cliente)", () => {
      expect(registry.findBySlug("mci-finance", "a")).toBeUndefined();
      expect(registry.findBySlug("mci-finance", "b")?.id).toBe("a");
    });
  });

  describe("filter", () => {
    beforeEach(() => {
      registry.replaceAll([
        summary({ id: "a", archived: false, status: "active", tags: ["vip", "es"] }),
        summary({ id: "b", archived: true, status: "paused", tags: ["es"] }),
        summary({ id: "c", archived: false, status: "prospect", tags: [] }),
      ]);
    });

    it("filtra por archived", () => {
      expect(registry.filter({ archived: true }).map((s) => s.id)).toEqual(["b"]);
    });

    it("filtra por status", () => {
      expect(registry.filter({ status: "prospect" }).map((s) => s.id)).toEqual(["c"]);
    });

    it("filtra por tags exigiendo coincidencia de todas", () => {
      expect(registry.filter({ tags: ["es"] }).map((s) => s.id)).toEqual(["a", "b"]);
      expect(registry.filter({ tags: ["vip", "es"] }).map((s) => s.id)).toEqual(["a"]);
    });

    it("combina varios criterios", () => {
      expect(registry.filter({ archived: false, status: "active" }).map((s) => s.id)).toEqual([
        "a",
      ]);
    });
  });

  describe("search", () => {
    beforeEach(() => {
      registry.replaceAll([
        summary({ id: "mci-finance", name: "MCI Finance", slug: "mci-finance", tags: ["banca"] }),
        summary({ id: "otro", name: "Otro Cliente", slug: "otro-cliente", tags: ["varios"] }),
      ]);
    });

    it("devuelve todo si la query está vacía", () => {
      expect(registry.search("  ").length).toBe(2);
    });

    it("busca por id, nombre, slug y etiquetas sin distinguir mayúsculas", () => {
      expect(registry.search("mci").map((s) => s.id)).toEqual(["mci-finance"]);
      expect(registry.search("FINANCE").map((s) => s.id)).toEqual(["mci-finance"]);
      expect(registry.search("banca").map((s) => s.id)).toEqual(["mci-finance"]);
    });

    it("no devuelve nada si no hay coincidencias", () => {
      expect(registry.search("inexistente")).toEqual([]);
    });
  });

  it("listTags devuelve las etiquetas distintas ordenadas", () => {
    registry.replaceAll([
      summary({ id: "a", tags: ["b", "a"] }),
      summary({ id: "c", tags: ["a", "c"] }),
    ]);
    expect(registry.listTags()).toEqual(["a", "b", "c"]);
  });

  it("clear vacía el índice", () => {
    registry.set(summary());
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});
