// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { EntityToolbar } from "../../../../src/renderer/entities/index.js";
import { mount } from "../../support/renderHelpers.js";

describe("EntityToolbar", () => {
  it("renderiza búsqueda, filtros y acción principal", () => {
    const { container, unmount } = mount(
      <EntityToolbar
        searchValue="x"
        onSearchChange={vi.fn()}
        filters={<span data-testid="filters" />}
        primaryAction={<button type="button">Crear agente</button>}
      />
    );
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("x");
    expect(container.querySelector('[data-testid="filters"]')).not.toBeNull();
    expect(container.querySelector(".dwm-entity-toolbar__primary")?.textContent).toBe(
      "Crear agente"
    );
    unmount();
  });
});
