import { describe, expect, it } from "vitest";
import {
  NAVIGATION_CATALOG,
  RESERVED_NAVIGATION_ITEMS,
} from "../../../src/renderer/shell/navigationCatalog.js";
import { isDesktopNavigationSection } from "../../../src/shared/types/DesktopConfig.js";

describe("NAVIGATION_CATALOG", () => {
  it("declara exactamente las 7 secciones reales del sidebar principal definitivo (rediseño de producto v2: solo el flujo real de trabajo), todas válidas y sin duplicados", () => {
    expect(NAVIGATION_CATALOG).toHaveLength(7);
    const sections = NAVIGATION_CATALOG.map((item) => item.section);
    expect(sections).toEqual([
      "dashboard",
      "provisioning",
      "clients",
      "projects",
      "aiLibrary",
      "workspace",
      "configuration",
    ]);
    expect(new Set(sections).size).toBe(sections.length);
    for (const section of sections) {
      expect(isDesktopNavigationSection(section)).toBe(true);
    }
  });

  it("muestra 'Biblioteca IA' en el sidebar principal, y ya no 'Agentes'/'Skills'/'Reglas' por separado (siguen navegables por compatibilidad, ver ContentArea)", () => {
    const sections = NAVIGATION_CATALOG.map((item) => item.section);
    expect(sections).toContain("aiLibrary");
    expect(sections).not.toContain("agents");
    expect(sections).not.toContain("skills");
    expect(sections).not.toContain("rules");
  });

  it("incluye 'dashboard' como primera sección, con la etiqueta 'Inicio'", () => {
    expect(NAVIGATION_CATALOG[0]?.section).toBe("dashboard");
    expect(NAVIGATION_CATALOG[0]?.label).toBe("Inicio");
  });

  it("las secciones técnicas/avanzadas ya no están en el sidebar principal (siguen siendo navegables desde 'Configuración', ver ConfiguracionScreen)", () => {
    const sections = NAVIGATION_CATALOG.map((item) => item.section);
    for (const advanced of [
      "profiles",
      "workspaces",
      "aiCreator",
      "ai",
      "tools",
      "plugins",
      "packages",
      "backups",
      "status",
      "logs",
      "settings",
      "help",
      "about",
    ]) {
      expect(sections).not.toContain(advanced);
      expect(isDesktopNavigationSection(advanced)).toBe(true);
    }
  });

  it("cada sección lleva un icono real (componente lucide-react), sin repetir el mismo icono dos veces", () => {
    for (const item of NAVIGATION_CATALOG) {
      expect(typeof item.icon).toBe("object");
    }
    const icons = NAVIGATION_CATALOG.map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe("RESERVED_NAVIGATION_ITEMS", () => {
  it("no deja secciones reservadas: todo lo del 33B ya está activo", () => {
    expect(RESERVED_NAVIGATION_ITEMS).toHaveLength(0);
  });
});
