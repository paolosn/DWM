import { describe, expect, it } from "vitest";
import * as primitives from "../../../../src/renderer/design-system/primitives/index.js";
import * as composites from "../../../../src/renderer/design-system/composites/index.js";

/**
 * Módulo 33A — cobertura de los barrels agregadores. Ningún componente
 * concreto importa `primitives/index.ts` o `composites/index.ts`
 * directamente (cada uno importa el componente puntual que necesita),
 * así que estos dos re-exports públicos solo se ejercitan aquí.
 */
describe("design-system barrels", () => {
  it("primitives/index.ts re-exporta todas las primitivas", () => {
    expect(primitives.Button).toBeDefined();
    expect(primitives.TextField).toBeDefined();
    expect(primitives.Combobox).toBeTypeOf("function");
  });

  it("composites/index.ts re-exporta todos los compuestos", () => {
    expect(composites.Modal).toBeTypeOf("function");
    expect(composites.DataTable).toBeTypeOf("function");
    expect(composites.useToast).toBeTypeOf("function");
  });
});
