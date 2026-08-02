// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EntityFilters } from "../../../../src/renderer/entities/index.js";
import { mount } from "../../support/renderHelpers.js";

describe("EntityFilters", () => {
  it("renderiza los controles de filtro que se le pasan por composición", () => {
    const { container, unmount } = mount(
      <EntityFilters>
        <span data-testid="filter-control">Estado</span>
      </EntityFilters>
    );
    expect(container.querySelector('[data-testid="filter-control"]')).not.toBeNull();
    expect(container.querySelector(".dwm-entity-filters")).not.toBeNull();
    unmount();
  });
});
