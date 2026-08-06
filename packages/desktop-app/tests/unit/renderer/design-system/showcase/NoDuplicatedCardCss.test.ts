import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SCREEN_CSS_FILES = [
  "src/renderer/screens/clients/ClientsScreen.css",
  "src/renderer/screens/profiles/ProfilesScreen.css",
  "src/renderer/screens/library/ContentLibraryPanel.css",
];

describe("Fase 1 — no queda CSS de borde/hover de Card duplicado en Clientes, Perfiles ni Biblioteca IA", () => {
  it("ninguna de las 3 pantallas redefine border-left/box-shadow/transform propios para .dwm-resource-card (ya vive en ResourceCard) -- salvo la excepción legítima de color dinámico real ya documentada", () => {
    for (const relativePath of SCREEN_CSS_FILES) {
      const css = readFileSync(new URL(`../../../../../${relativePath}`, import.meta.url), "utf-8");
      const ruleForResourceCard = /\.dwm-resource-card\s*\{[^}]*\}/g;
      const matches = css.match(ruleForResourceCard) ?? [];
      for (const rule of matches) {
        // border-left-color (sin -width/-style) referenciando un token real
        // es la única excepción legítima ya documentada (color propio de un
        // kit de Perfiles) -- nunca el shorthand completo ni box-shadow/transform.
        expect(rule).not.toMatch(/border-left\s*:/);
        expect(rule).not.toMatch(/box-shadow/);
        expect(rule).not.toMatch(/transform/);
      }
    }
  });

  it("ninguna de las 3 pantallas usa un color hexadecimal a mano para el borde de una Card (solo tokens reales)", () => {
    for (const relativePath of SCREEN_CSS_FILES) {
      const css = readFileSync(new URL(`../../../../../${relativePath}`, import.meta.url), "utf-8");
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    }
  });
});
