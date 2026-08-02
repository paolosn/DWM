// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { HealthRow } from "../../../../../src/renderer/design-system/composites/HealthRow/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("HealthRow", () => {
  it("renderiza etiqueta, estado y detalle opcional", () => {
    const { container, unmount } = mount(
      <HealthRow
        label="Servicio local"
        statusLabel="Operativo"
        tone="success"
        detail="Puerto 4521"
      />
    );
    expect(container.textContent).toContain("Servicio local");
    expect(container.textContent).toContain("Operativo");
    expect(container.textContent).toContain("Puerto 4521");
    unmount();
  });
});
