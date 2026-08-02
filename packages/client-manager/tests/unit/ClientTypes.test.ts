import { describe, it, expect } from "vitest";
import {
  CLIENT_DWM_KEY,
  CLIENT_FILE_EXTENSION,
  CLIENT_REFERENCE_KINDS,
  CLIENT_STATUSES,
  emptyClientReferences,
  isClientReferenceKind,
  isClientStatus,
  isSafeClientDescription,
  isSafeClientId,
  isSafeClientName,
  isSafeClientSlug,
  isSafeClientTag,
  normalizeTags,
  withReferenceAdded,
  withReferenceRemoved,
} from "../../src/ClientTypes.js";

describe("isSafeClientId", () => {
  it("acepta identificadores alfanuméricos simples", () => {
    expect(isSafeClientId("mci-finance")).toBe(true);
    expect(isSafeClientId("cliente_legado.v2")).toBe(true);
    expect(isSafeClientId("A")).toBe(true);
  });

  it("rechaza valores no seguros", () => {
    expect(isSafeClientId("")).toBe(false);
    expect(isSafeClientId(".")).toBe(false);
    expect(isSafeClientId("..")).toBe(false);
    expect(isSafeClientId("../otro")).toBe(false);
    expect(isSafeClientId("a/b")).toBe(false);
    expect(isSafeClientId(".oculto")).toBe(false);
    expect(isSafeClientId(123)).toBe(false);
    expect(isSafeClientId(undefined)).toBe(false);
    expect(isSafeClientId("a".repeat(129))).toBe(false);
  });
});

describe("isSafeClientSlug", () => {
  it("acepta slugs válidos", () => {
    expect(isSafeClientSlug("mci-finance")).toBe(true);
    expect(isSafeClientSlug("a")).toBe(true);
    expect(isSafeClientSlug("a1-b2")).toBe(true);
  });

  it("rechaza slugs inválidos", () => {
    expect(isSafeClientSlug("")).toBe(false);
    expect(isSafeClientSlug("MCI-Finance")).toBe(false);
    expect(isSafeClientSlug("-mci")).toBe(false);
    expect(isSafeClientSlug("mci-")).toBe(false);
    expect(isSafeClientSlug("mci--finance")).toBe(false);
    expect(isSafeClientSlug("mci finance")).toBe(false);
    expect(isSafeClientSlug(42)).toBe(false);
  });
});

describe("isSafeClientName / isSafeClientDescription / isSafeClientTag", () => {
  it("aceptan texto dentro de los límites", () => {
    expect(isSafeClientName("MCI Finance S.L.")).toBe(true);
    expect(isSafeClientDescription("Proveedor de servicios financieros.")).toBe(true);
    expect(isSafeClientTag("finanzas")).toBe(true);
  });

  it("rechazan valores fuera de los límites o vacíos", () => {
    expect(isSafeClientName("")).toBe(false);
    expect(isSafeClientName("   ")).toBe(false);
    expect(isSafeClientName("a".repeat(257))).toBe(false);
    expect(isSafeClientName(42)).toBe(false);
    expect(isSafeClientDescription("a".repeat(5001))).toBe(false);
    expect(isSafeClientDescription(42)).toBe(false);
    expect(isSafeClientTag("")).toBe(false);
    expect(isSafeClientTag("a,b")).toBe(false);
    expect(isSafeClientTag("a".repeat(65))).toBe(false);
  });
});

describe("isClientStatus / isClientReferenceKind", () => {
  it("aceptan únicamente los valores del catálogo cerrado", () => {
    for (const status of CLIENT_STATUSES) expect(isClientStatus(status)).toBe(true);
    expect(isClientStatus("won")).toBe(false);
    expect(isClientStatus(42)).toBe(false);

    for (const kind of CLIENT_REFERENCE_KINDS) expect(isClientReferenceKind(kind)).toBe(true);
    expect(isClientReferenceKind("clients")).toBe(false);
    expect(isClientReferenceKind(42)).toBe(false);
  });
});

describe("normalizeTags", () => {
  it("recorta, pasa a minúsculas y elimina duplicados preservando el orden", () => {
    expect(normalizeTags([" Finanzas ", "finanzas", "VIP", ""])).toEqual(["finanzas", "vip"]);
  });
});

describe("emptyClientReferences", () => {
  it("devuelve las cinco categorías vacías", () => {
    expect(emptyClientReferences()).toEqual({
      projects: [],
      knowledge: [],
      agents: [],
      skills: [],
      rules: [],
    });
  });
});

describe("withReferenceAdded / withReferenceRemoved", () => {
  it("añade de forma idempotente, preservando el orden", () => {
    const once = withReferenceAdded([], "a");
    expect(once).toEqual(["a"]);
    expect(withReferenceAdded(once, "a")).toEqual(["a"]);
    expect(withReferenceAdded(once, "b")).toEqual(["a", "b"]);
  });

  it("retira de forma idempotente", () => {
    const list = ["a", "b"];
    expect(withReferenceRemoved(list, "a")).toEqual(["b"]);
    expect(withReferenceRemoved(list, "no-existe")).toBe(list);
  });
});

describe("constantes", () => {
  it("expone la extensión de fichero y la clave reservada", () => {
    expect(CLIENT_FILE_EXTENSION).toBe(".json");
    expect(CLIENT_DWM_KEY).toBe("dwm");
  });
});
