import { describe, it, expect } from "vitest";
import {
  RULE_DWM_FRONTMATTER_KEY,
  RULE_FILE_EXTENSION,
  isRuleContent,
  isSafeRuleId,
} from "../../src/RuleTypes.js";

describe("isSafeRuleId", () => {
  it("acepta identificadores alfanuméricos simples", () => {
    expect(isSafeRuleId("mi-regla")).toBe(true);
    expect(isSafeRuleId("regla_legada.v2")).toBe(true);
    expect(isSafeRuleId("A")).toBe(true);
  });

  it("rechaza valores no seguros", () => {
    expect(isSafeRuleId("")).toBe(false);
    expect(isSafeRuleId(".")).toBe(false);
    expect(isSafeRuleId("..")).toBe(false);
    expect(isSafeRuleId("../otra")).toBe(false);
    expect(isSafeRuleId("a/b")).toBe(false);
    expect(isSafeRuleId(".oculta")).toBe(false);
    expect(isSafeRuleId(123)).toBe(false);
    expect(isSafeRuleId(undefined)).toBe(false);
    expect(isSafeRuleId("a".repeat(129))).toBe(false);
  });
});

describe("isRuleContent", () => {
  it("acepta cualquier cadena", () => {
    expect(isRuleContent("")).toBe(true);
    expect(isRuleContent("# Título\n")).toBe(true);
  });

  it("rechaza valores que no son cadenas", () => {
    expect(isRuleContent(null)).toBe(false);
    expect(isRuleContent(42)).toBe(false);
    expect(isRuleContent(undefined)).toBe(false);
  });
});

describe("constantes", () => {
  it("expone la extensión de fichero y la clave reservada", () => {
    expect(RULE_FILE_EXTENSION).toBe(".md");
    expect(RULE_DWM_FRONTMATTER_KEY).toBe("dwm");
  });
});
