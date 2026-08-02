// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { InlineAlert } from "../../../../../src/renderer/design-system/composites/InlineAlert/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("InlineAlert", () => {
  it("usa role=status para tonos no urgentes", () => {
    const { container, unmount } = mount(
      <InlineAlert tone="info" title="Función no disponible en esta versión" />
    );
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    unmount();
  });

  it("usa role=alert para warning y danger", () => {
    const { container: c1, unmount: u1 } = mount(
      <InlineAlert tone="warning" title="Contrato próximo a vencer" />
    );
    expect(c1.querySelector('[role="alert"]')).not.toBeNull();
    u1();
    const { container: c2, unmount: u2 } = mount(
      <InlineAlert tone="danger" title="Documentación pendiente" />
    );
    expect(c2.querySelector('[role="alert"]')).not.toBeNull();
    u2();
  });

  it("renderiza contenido adicional cuando se provee", () => {
    const { container, unmount } = mount(
      <InlineAlert title="Aviso">
        <span>Detalle adicional</span>
      </InlineAlert>
    );
    expect(container.textContent).toContain("Detalle adicional");
    unmount();
  });
});
