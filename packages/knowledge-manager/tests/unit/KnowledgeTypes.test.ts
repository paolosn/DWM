import { describe, it, expect } from "vitest";
import {
  KNOWLEDGE_ALLOWED_EXTENSIONS,
  KNOWLEDGE_DWM_FRONTMATTER_KEY,
  hasKnowledgeExtension,
  isKnowledgeContent,
  isSafeKnowledgeCategory,
  isSafeKnowledgeId,
  isSafeKnowledgeTag,
  knowledgeBaseName,
  normalizeTags,
  toKnowledgeId,
} from "../../src/KnowledgeTypes.js";

describe("isSafeKnowledgeId", () => {
  it("acepta rutas relativas seguras con extensión reconocida", () => {
    expect(isSafeKnowledgeId("nota.md")).toBe(true);
    expect(isSafeKnowledgeId("guias/onboarding.md")).toBe(true);
    expect(isSafeKnowledgeId("a/b/c/d.markdown")).toBe(true);
    expect(isSafeKnowledgeId("Notas Con Espacios.txt")).toBe(true);
  });

  it("rechaza valores no seguros", () => {
    expect(isSafeKnowledgeId("")).toBe(false);
    expect(isSafeKnowledgeId("/absoluta.md")).toBe(false);
    expect(isSafeKnowledgeId("C:\\windows.md")).toBe(false);
    expect(isSafeKnowledgeId("../fuera.md")).toBe(false);
    expect(isSafeKnowledgeId("guias/../fuera.md")).toBe(false);
    expect(isSafeKnowledgeId("guias/./a.md")).toBe(false);
    expect(isSafeKnowledgeId("sin-extension")).toBe(false);
    expect(isSafeKnowledgeId("binario.png")).toBe(false);
    expect(isSafeKnowledgeId(123)).toBe(false);
    expect(isSafeKnowledgeId(undefined)).toBe(false);
    expect(isSafeKnowledgeId("a".repeat(600) + ".md")).toBe(false);
  });

  it("rechaza profundidad de ruta excesiva", () => {
    const deep = Array.from({ length: 20 }, (_, i) => `n${i}`).join("/") + ".md";
    expect(isSafeKnowledgeId(deep)).toBe(false);
  });
});

describe("hasKnowledgeExtension", () => {
  it("reconoce las extensiones del catálogo, sin distinguir mayúsculas", () => {
    for (const ext of KNOWLEDGE_ALLOWED_EXTENSIONS) {
      expect(hasKnowledgeExtension(`fichero${ext}`)).toBe(true);
      expect(hasKnowledgeExtension(`FICHERO${ext.toUpperCase()}`)).toBe(true);
    }
    expect(hasKnowledgeExtension("fichero.pdf")).toBe(false);
  });
});

describe("isKnowledgeContent", () => {
  it("acepta cualquier cadena y rechaza el resto", () => {
    expect(isKnowledgeContent("")).toBe(true);
    expect(isKnowledgeContent("# Título\n")).toBe(true);
    expect(isKnowledgeContent(null)).toBe(false);
    expect(isKnowledgeContent(42)).toBe(false);
  });
});

describe("isSafeKnowledgeTag / isSafeKnowledgeCategory", () => {
  it("aceptan texto corto y no vacío", () => {
    expect(isSafeKnowledgeTag("backend")).toBe(true);
    expect(isSafeKnowledgeCategory("Infraestructura")).toBe(true);
  });

  it("rechazan vacíos, separadores de lista y valores excesivamente largos", () => {
    expect(isSafeKnowledgeTag("")).toBe(false);
    expect(isSafeKnowledgeTag("  ")).toBe(false);
    expect(isSafeKnowledgeTag("a,b")).toBe(false);
    expect(isSafeKnowledgeTag("a[b]")).toBe(false);
    expect(isSafeKnowledgeTag(42)).toBe(false);
    expect(isSafeKnowledgeTag("a".repeat(65))).toBe(false);
    expect(isSafeKnowledgeCategory("")).toBe(false);
    expect(isSafeKnowledgeCategory("a".repeat(129))).toBe(false);
  });
});

describe("normalizeTags", () => {
  it("recorta, pasa a minúsculas y elimina duplicados preservando el orden", () => {
    expect(normalizeTags([" Backend ", "backend", "API", ""])).toEqual(["backend", "api"]);
  });
});

describe("toKnowledgeId / knowledgeBaseName", () => {
  it("normaliza separadores de sistema a '/'", () => {
    expect(toKnowledgeId("guias\\onboarding.md")).toBe("guias/onboarding.md");
  });

  it("extrae el nombre de fichero de un id anidado", () => {
    expect(knowledgeBaseName("guias/onboarding.md")).toBe("onboarding.md");
    expect(knowledgeBaseName("nota.md")).toBe("nota.md");
  });
});

describe("constantes", () => {
  it("expone el catálogo de extensiones y la clave reservada", () => {
    expect(KNOWLEDGE_ALLOWED_EXTENSIONS).toContain(".md");
    expect(KNOWLEDGE_DWM_FRONTMATTER_KEY).toBe("dwm");
  });
});
