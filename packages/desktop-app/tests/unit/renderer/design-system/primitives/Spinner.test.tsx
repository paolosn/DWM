// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Spinner } from "../../../../../src/renderer/design-system/primitives/Spinner/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("Spinner", () => {
  it("expone role=status con etiqueta accesible por defecto", () => {
    const { container, unmount } = mount(<Spinner />);
    const el = container.querySelector('[data-testid="spinner"]');
    expect(el?.getAttribute("role")).toBe("status");
    expect(el?.textContent).toContain("Cargando…");
    unmount();
  });

  it("acepta una etiqueta y tamaño personalizados", () => {
    const { container, unmount } = mount(<Spinner label="Sincronizando" size="sm" />);
    const el = container.querySelector('[data-testid="spinner"]');
    expect(el?.textContent).toContain("Sincronizando");
    expect(el?.className).toContain("dwm-spinner--sm");
    unmount();
  });
});
