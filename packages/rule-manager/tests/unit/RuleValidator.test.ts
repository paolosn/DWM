import { describe, it, expect } from "vitest";
import { RuleValidator } from "../../src/RuleValidator.js";
import { RuleErrorCode } from "../../src/errors/RuleErrorCode.js";
import type { Rule } from "../../src/RuleTypes.js";

describe("RuleValidator", () => {
  const validator = new RuleValidator();

  describe("validateId() / assertValidId()", () => {
    it("acepta identificadores válidos", () => {
      expect(validator.validateId("mi-regla").valid).toBe(true);
    });

    it("reporta un issue claro para identificadores inválidos", () => {
      const result = validator.validateId("../fuera");
      expect(result.valid).toBe(false);
      expect(result.issues[0]?.field).toBe("id");
    });

    it("assertValidId lanza RuleError con código RULE_INVALID_ID", () => {
      expect(() => validator.assertValidId("")).toThrowError(
        expect.objectContaining({ code: RuleErrorCode.RULE_INVALID_ID })
      );
    });

    it("assertValidId no lanza para un id válido", () => {
      expect(() => validator.assertValidId("valido")).not.toThrow();
    });
  });

  describe("validateContent() / assertValidContent()", () => {
    it("acepta contenido Markdown sin frontmatter reservado", () => {
      expect(validator.validateContent("# Título\nCuerpo.\n").valid).toBe(true);
      expect(validator.validateContent("---\ntitle: X\n---\nCuerpo\n").valid).toBe(true);
    });

    it("rechaza valores que no son cadenas", () => {
      expect(validator.validateContent(null).valid).toBe(false);
      expect(validator.validateContent(42).valid).toBe(false);
    });

    it("rechaza contenido con frontmatter mal formado", () => {
      const result = validator.validateContent("---\ntitle: X\nnunca se cierra\n");
      expect(result.valid).toBe(false);
      expect(result.issues[0]?.field).toBe("content");
    });

    it("rechaza contenido cuyo frontmatter ya usa la clave reservada dwm:", () => {
      const result = validator.validateContent("---\ndwm:\n  archived: true\n---\nCuerpo\n");
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.message.includes("dwm:"))).toBe(true);
    });

    it("assertValidContent lanza RuleError con código RULE_VALIDATION_FAILED", () => {
      expect(() => validator.assertValidContent(null)).toThrowError(
        expect.objectContaining({ code: RuleErrorCode.RULE_VALIDATION_FAILED })
      );
    });

    it("assertValidContent no lanza para contenido válido", () => {
      expect(() => validator.assertValidContent("# X\n")).not.toThrow();
    });
  });

  describe("validateStructure() / assertValidStructure()", () => {
    function makeRule(overrides: Partial<Rule> = {}): Rule {
      return {
        id: "mi-regla",
        content: "# X\n",
        metadata: {
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...overrides,
      };
    }

    it("acepta una regla bien formada", () => {
      expect(validator.validateStructure(makeRule()).valid).toBe(true);
    });

    it("acepta una regla archivada con archivedAt válido", () => {
      const rule = makeRule({
        metadata: {
          archived: true,
          archivedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      expect(validator.validateStructure(rule).valid).toBe(true);
    });

    it("acumula issues de id, contenido y metadatos inválidos", () => {
      const rule = makeRule({
        id: "..",
        content: 42 as unknown as string,
        metadata: {
          archived: "no" as unknown as boolean,
          createdAt: "no-es-fecha",
          updatedAt: "no-es-fecha",
          archivedAt: "tampoco-es-fecha",
        },
      });
      const result = validator.validateStructure(rule);
      expect(result.valid).toBe(false);
      const fields = result.issues.map((i) => i.field);
      expect(fields).toContain("id");
      expect(fields).toContain("content");
      expect(fields).toContain("metadata.createdAt");
      expect(fields).toContain("metadata.updatedAt");
      expect(fields).toContain("metadata.archived");
      expect(fields).toContain("metadata.archivedAt");
    });

    it("assertValidStructure lanza RuleError con código RULE_INVALID_STRUCTURE", () => {
      const rule = makeRule({ id: ".." });
      expect(() => validator.assertValidStructure(rule)).toThrowError(
        expect.objectContaining({ code: RuleErrorCode.RULE_INVALID_STRUCTURE })
      );
    });

    it("assertValidStructure no lanza para una regla válida", () => {
      expect(() => validator.assertValidStructure(makeRule())).not.toThrow();
    });
  });
});
