// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "../../../../../src/renderer/design-system/composites/FilterBar/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("FilterBar", () => {
  it("renderiza el campo de búsqueda con el valor dado", () => {
    const { container, unmount } = mount(
      <FilterBar searchValue="agente" onSearchChange={vi.fn()} />
    );
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("agente");
    unmount();
  });

  it("renderiza filtros adicionales cuando se proveen", () => {
    const { container, unmount } = mount(
      <FilterBar
        searchValue=""
        onSearchChange={vi.fn()}
        filters={<span data-testid="extra">Estado</span>}
      />
    );
    expect(container.querySelector('[data-testid="extra"]')).not.toBeNull();
    unmount();
  });

  it("muestra 'Limpiar filtros' solo cuando hay filtros activos y onClear", () => {
    const onClear = vi.fn();
    const { container, unmount } = mount(
      <FilterBar searchValue="" onSearchChange={vi.fn()} hasActiveFilters onClear={onClear} />
    );
    const clearButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Limpiar filtros"
    );
    expect(clearButton).not.toBeUndefined();
    click(clearButton ?? null);
    expect(onClear).toHaveBeenCalledTimes(1);
    unmount();
  });
});
