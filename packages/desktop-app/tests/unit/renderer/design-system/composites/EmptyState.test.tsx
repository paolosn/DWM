// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EmptyState } from "../../../../../src/renderer/design-system/composites/EmptyState/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("EmptyState", () => {
  it("renderiza título, descripción y acción cuando se proveen", () => {
    const { container, unmount } = mount(
      <EmptyState
        title="Sin proyectos"
        description="Crea tu primer proyecto para empezar."
        action={<button type="button">Crear proyecto</button>}
      />
    );
    expect(container.textContent).toContain("Sin proyectos");
    expect(container.textContent).toContain("Crea tu primer proyecto");
    expect(container.querySelector("button")?.textContent).toBe("Crear proyecto");
    unmount();
  });

  it("funciona solo con título", () => {
    const { container, unmount } = mount(<EmptyState title="Sin resultados" />);
    expect(container.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    unmount();
  });
});
