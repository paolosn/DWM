import { describe, it, expect } from "vitest";
import { ALL_PSN_RESOURCE_KINDS, isPSNResourceKind } from "../../src/PSNTypes.js";

describe("ALL_PSN_RESOURCE_KINDS / isPSNResourceKind", () => {
  it("incluye los doce elementos documentados", () => {
    expect(ALL_PSN_RESOURCE_KINDS).toHaveLength(12);
    expect(ALL_PSN_RESOURCE_KINDS).toEqual(
      expect.arrayContaining([
        "psn-base",
        "kilo",
        "agents",
        "skills",
        "rules",
        "psn-knowledge-global",
        "proyectos",
        "clientes",
        "auditorias",
        "seguridad",
        "redes-sociales",
        "psn-panel",
      ])
    );
  });

  it("isPSNResourceKind() acepta solo valores del catálogo", () => {
    expect(isPSNResourceKind("psn-base")).toBe(true);
    expect(isPSNResourceKind("otro")).toBe(false);
    expect(isPSNResourceKind(undefined)).toBe(false);
  });
});
