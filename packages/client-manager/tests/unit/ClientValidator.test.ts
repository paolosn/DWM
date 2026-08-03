import { describe, it, expect } from "vitest";
import { ClientValidator } from "../../src/ClientValidator.js";
import { ClientErrorCode } from "../../src/errors/ClientErrorCode.js";
import type { Client } from "../../src/ClientTypes.js";

const validator = new ClientValidator();

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "mci-finance",
    name: "MCI Finance",
    slug: "mci-finance",
    status: "active",
    tags: ["finanzas"],
    references: { projects: [], knowledge: [], agents: [], skills: [], rules: [] },
    dwm: {
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("validateId / assertValidId", () => {
  it("acepta ids válidos y rechaza inseguros", () => {
    expect(validator.validateId("mci-finance").valid).toBe(true);
    expect(() => validator.assertValidId("../fuera")).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_ID })
    );
  });
});

describe("validateSlug / assertValidSlug", () => {
  it("acepta slugs válidos y rechaza inválidos", () => {
    expect(validator.validateSlug("mci-finance").valid).toBe(true);
    expect(() => validator.assertValidSlug("MCI Finance")).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_SLUG })
    );
  });
});

describe("validateName / assertValidName", () => {
  it("acepta nombres válidos y rechaza vacíos", () => {
    expect(validator.validateName("MCI Finance").valid).toBe(true);
    expect(() => validator.assertValidName("")).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_NAME })
    );
  });
});

describe("validateDescription / assertValidDescription", () => {
  it("acepta ausente, undefined, null y texto válido", () => {
    expect(validator.validateDescription(undefined).valid).toBe(true);
    expect(validator.validateDescription(null).valid).toBe(true);
    expect(validator.validateDescription("texto").valid).toBe(true);
  });

  it("rechaza descripciones demasiado largas", () => {
    expect(() => validator.assertValidDescription("a".repeat(5001))).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_DESCRIPTION })
    );
  });
});

describe("validateDefaultAi / assertValidDefaultAi", () => {
  it("acepta ausente, undefined, null y un objeto con campos de texto válidos", () => {
    expect(validator.validateDefaultAi(undefined).valid).toBe(true);
    expect(validator.validateDefaultAi(null).valid).toBe(true);
    expect(
      validator.validateDefaultAi({
        provider: "openai",
        model: "gpt-4o",
        fallbackModel: "gpt-4o-mini",
        secretReference: "connections.mci.openai.apiKey.abc123",
      }).valid
    ).toBe(true);
  });

  it("acepta un objeto vacío (todos los campos son opcionales)", () => {
    expect(validator.validateDefaultAi({}).valid).toBe(true);
  });

  it("rechaza un valor que no sea un objeto", () => {
    expect(() => validator.assertValidDefaultAi("openai")).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_DEFAULT_AI })
    );
  });

  it("rechaza campos que no sean texto o que excedan la longitud máxima", () => {
    expect(() => validator.assertValidDefaultAi({ provider: 123 })).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_DEFAULT_AI })
    );
    expect(() => validator.assertValidDefaultAi({ model: "a".repeat(257) })).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_DEFAULT_AI })
    );
  });

  it("nunca exige ni acepta un valor de secreto en claro: solo referencias de texto", () => {
    // No hay ningún campo "secretValue"/"apiKey" en la forma válida; solo "secretReference".
    const result = validator.validateDefaultAi({ secretReference: "ref-segura" });
    expect(result.valid).toBe(true);
  });

  it("acepta baseUrl y format (cierre de limitaciones item 6: agnóstico de proveedor)", () => {
    expect(
      validator.validateDefaultAi({
        provider: "openai-compatible",
        baseUrl: "https://api.example.test/v1",
        format: "openai",
      }).valid
    ).toBe(true);
    expect(validator.validateDefaultAi({ format: "anthropic" }).valid).toBe(true);
  });

  it("rechaza un format que no sea 'openai' ni 'anthropic'", () => {
    expect(() => validator.assertValidDefaultAi({ format: "otro" })).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_DEFAULT_AI })
    );
  });
});

describe("validateTags / assertValidTags", () => {
  it("acepta listas válidas, incluida la vacía", () => {
    expect(validator.validateTags([]).valid).toBe(true);
    expect(validator.validateTags(["finanzas", "vip"]).valid).toBe(true);
  });

  it("rechaza etiquetas inválidas", () => {
    expect(() => validator.assertValidTags(["a,b"])).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_TAG })
    );
  });
});

describe("validateStatus / assertValidStatus", () => {
  it("acepta valores del catálogo cerrado y rechaza el resto", () => {
    expect(validator.validateStatus("active").valid).toBe(true);
    expect(() => validator.assertValidStatus("won")).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_STATUS })
    );
  });
});

describe("assertValidReferenceKind / assertValidReferenceId", () => {
  it("acepta categorías del catálogo cerrado y rechaza el resto", () => {
    expect(() => validator.assertValidReferenceKind("projects")).not.toThrow();
    expect(() => validator.assertValidReferenceKind("clients")).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_REFERENCE_KIND })
    );
  });

  it("acepta ids de referencia válidos y rechaza inválidos", () => {
    expect(() => validator.assertValidReferenceId("proyecto-1")).not.toThrow();
    expect(() => validator.assertValidReferenceId("")).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_REFERENCE_ID })
    );
    expect(() => validator.assertValidReferenceId("con\nsalto")).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_REFERENCE_ID })
    );
  });
});

describe("validateStructure / assertValidStructure", () => {
  it("acepta un cliente bien formado", () => {
    expect(validator.validateStructure(makeClient()).valid).toBe(true);
    expect(() => validator.assertValidStructure(makeClient())).not.toThrow();
  });

  it("acumula issues por cada campo inválido", () => {
    const client = makeClient({
      id: "../fuera",
      slug: "Invalido",
      name: "",
      status: "won" as never,
      dwm: {
        archived: false,
        createdAt: "no-es-fecha",
        updatedAt: "no-es-fecha",
      },
    });
    const result = validator.validateStructure(client);
    expect(result.valid).toBe(false);
    const fields = result.issues.map((issue) => issue.field);
    expect(fields).toContain("id");
    expect(fields).toContain("slug");
    expect(fields).toContain("name");
    expect(fields).toContain("status");
    expect(fields).toContain("dwm.createdAt");
    expect(fields).toContain("dwm.updatedAt");
  });

  it("rechaza referencias con ids duplicados dentro de una misma categoría", () => {
    const client = makeClient({
      references: {
        projects: ["a", "a"],
        knowledge: [],
        agents: [],
        skills: [],
        rules: [],
      },
    });
    const result = validator.validateStructure(client);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.field === "references.projects")).toBe(true);
  });

  it("rechaza archivedAt con formato inválido", () => {
    const client = makeClient({
      dwm: {
        archived: true,
        archivedAt: "no-es-fecha",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(validator.validateStructure(client).valid).toBe(false);
  });

  it("lanza CLIENT_INVALID_STRUCTURE cuando la estructura no es válida", () => {
    expect(() => validator.assertValidStructure(makeClient({ id: "../fuera" }))).toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_STRUCTURE })
    );
  });
});
