import { describe, it, expect } from "vitest";
import {
  SKILL_DWM_FRONTMATTER_KEY,
  SKILL_FILE_NAME,
  isSafeSkillId,
  isSafeSkillRelativePath,
} from "../../src/SkillTypes.js";

describe("isSafeSkillId", () => {
  it("acepta identificadores alfanuméricos simples", () => {
    expect(isSafeSkillId("mi-skill")).toBe(true);
    expect(isSafeSkillId("skill_legada.v2")).toBe(true);
    expect(isSafeSkillId("A")).toBe(true);
  });

  it("rechaza valores no seguros", () => {
    expect(isSafeSkillId("")).toBe(false);
    expect(isSafeSkillId(".")).toBe(false);
    expect(isSafeSkillId("..")).toBe(false);
    expect(isSafeSkillId("../otra")).toBe(false);
    expect(isSafeSkillId("a/b")).toBe(false);
    expect(isSafeSkillId(".oculta")).toBe(false);
    expect(isSafeSkillId(123)).toBe(false);
    expect(isSafeSkillId(undefined)).toBe(false);
    expect(isSafeSkillId("a".repeat(129))).toBe(false);
  });
});

describe("isSafeSkillRelativePath", () => {
  it("acepta rutas relativas simples y anidadas", () => {
    expect(isSafeSkillRelativePath("script.sh")).toBe(true);
    expect(isSafeSkillRelativePath("plantillas/base.tpl")).toBe(true);
    expect(isSafeSkillRelativePath(".oculto")).toBe(true);
    expect(isSafeSkillRelativePath("carpeta/.oculto")).toBe(true);
  });

  it("rechaza rutas absolutas, traversal y valores no seguros", () => {
    expect(isSafeSkillRelativePath("")).toBe(false);
    expect(isSafeSkillRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeSkillRelativePath("\\windows\\system32")).toBe(false);
    expect(isSafeSkillRelativePath("C:\\otra")).toBe(false);
    expect(isSafeSkillRelativePath("../fuera")).toBe(false);
    expect(isSafeSkillRelativePath("carpeta/../../fuera")).toBe(false);
    expect(isSafeSkillRelativePath(42)).toBe(false);
  });
});

describe("constantes", () => {
  it("expone el nombre de fichero y la clave reservada", () => {
    expect(SKILL_FILE_NAME).toBe("SKILL.md");
    expect(SKILL_DWM_FRONTMATTER_KEY).toBe("dwm");
  });
});
