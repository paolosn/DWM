import { describe, it, expect } from "vitest";
import { SkillValidator } from "../../src/SkillValidator.js";
import { SkillErrorCode } from "../../src/errors/SkillErrorCode.js";
import type { Skill } from "../../src/SkillTypes.js";

describe("SkillValidator", () => {
  const validator = new SkillValidator();

  describe("validateId() / assertValidId()", () => {
    it("acepta identificadores válidos", () => {
      expect(validator.validateId("mi-skill").valid).toBe(true);
    });

    it("reporta un issue claro para identificadores inválidos", () => {
      const result = validator.validateId("../fuera");
      expect(result.valid).toBe(false);
      expect(result.issues[0]?.field).toBe("id");
    });

    it("assertValidId lanza SkillError con código SKILL_INVALID_ID", () => {
      expect(() => validator.assertValidId("")).toThrowError(
        expect.objectContaining({ code: SkillErrorCode.SKILL_INVALID_ID })
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

    it("assertValidContent lanza SkillError con código SKILL_VALIDATION_FAILED", () => {
      expect(() => validator.assertValidContent(null)).toThrowError(
        expect.objectContaining({ code: SkillErrorCode.SKILL_VALIDATION_FAILED })
      );
    });

    it("assertValidContent no lanza para contenido válido", () => {
      expect(() => validator.assertValidContent("# X\n")).not.toThrow();
    });
  });

  describe("validateAuxRelativePath() / assertValidAuxRelativePath()", () => {
    it("acepta rutas relativas seguras", () => {
      expect(validator.validateAuxRelativePath("scripts/build.sh").valid).toBe(true);
    });

    it("rechaza path traversal y rutas absolutas", () => {
      expect(validator.validateAuxRelativePath("../fuera").valid).toBe(false);
      expect(validator.validateAuxRelativePath("/etc/passwd").valid).toBe(false);
    });

    it("assertValidAuxRelativePath lanza SkillError con código SKILL_UNSAFE_PATH", () => {
      expect(() => validator.assertValidAuxRelativePath("../fuera")).toThrowError(
        expect.objectContaining({ code: SkillErrorCode.SKILL_UNSAFE_PATH })
      );
    });

    it("assertValidAuxRelativePath no lanza para una ruta segura", () => {
      expect(() => validator.assertValidAuxRelativePath("a/b.txt")).not.toThrow();
    });
  });

  describe("validateStructure() / assertValidStructure()", () => {
    function makeSkill(overrides: Partial<Skill> = {}): Skill {
      return {
        id: "mi-skill",
        content: "# X\n",
        metadata: {
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...overrides,
      };
    }

    it("acepta una skill bien formada", () => {
      expect(validator.validateStructure(makeSkill()).valid).toBe(true);
    });

    it("acepta una skill archivada con archivedAt válido", () => {
      const skill = makeSkill({
        metadata: {
          archived: true,
          archivedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      expect(validator.validateStructure(skill).valid).toBe(true);
    });

    it("acumula issues de id, contenido y metadatos inválidos", () => {
      const skill = makeSkill({
        id: "..",
        content: 42 as unknown as string,
        metadata: {
          archived: "no" as unknown as boolean,
          createdAt: "no-es-fecha",
          updatedAt: "no-es-fecha",
          archivedAt: "tampoco-es-fecha",
        },
      });
      const result = validator.validateStructure(skill);
      expect(result.valid).toBe(false);
      const fields = result.issues.map((i) => i.field);
      expect(fields).toContain("id");
      expect(fields).toContain("content");
      expect(fields).toContain("metadata.createdAt");
      expect(fields).toContain("metadata.updatedAt");
      expect(fields).toContain("metadata.archived");
      expect(fields).toContain("metadata.archivedAt");
    });

    it("assertValidStructure lanza SkillError con código SKILL_INVALID_STRUCTURE", () => {
      const skill = makeSkill({ id: ".." });
      expect(() => validator.assertValidStructure(skill)).toThrowError(
        expect.objectContaining({ code: SkillErrorCode.SKILL_INVALID_STRUCTURE })
      );
    });

    it("assertValidStructure no lanza para una skill válida", () => {
      expect(() => validator.assertValidStructure(makeSkill())).not.toThrow();
    });
  });
});
