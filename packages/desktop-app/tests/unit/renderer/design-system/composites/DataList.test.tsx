// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DataList } from "../../../../../src/renderer/design-system/composites/DataList/index.js";
import { mount } from "../../../support/renderHelpers.js";

interface ProjectItem {
  readonly id: string;
  readonly name: string;
}

const items: ProjectItem[] = [
  { id: "p1", name: "DWM" },
  { id: "p2", name: "GeoRankMap" },
];

describe("DataList", () => {
  it("renderiza un item por cada elemento usando renderItem", () => {
    const { container, unmount } = mount(
      <DataList
        items={items}
        getItemId={(item) => item.id}
        renderItem={(item) => <span>{item.name}</span>}
        ariaLabel="Proyectos"
      />
    );
    expect(container.querySelectorAll("li").length).toBe(2);
    expect(container.textContent).toContain("DWM");
    expect(container.textContent).toContain("GeoRankMap");
    unmount();
  });

  it("muestra skeletons en loading y no los items reales", () => {
    const { container, unmount } = mount(
      <DataList
        items={items}
        getItemId={(item) => item.id}
        renderItem={(item) => <span>{item.name}</span>}
        ariaLabel="Proyectos"
        loading
        skeletonItemCount={4}
      />
    );
    expect(container.querySelectorAll('[data-testid="data-list-skeleton-item"]').length).toBe(4);
    expect(container.textContent).not.toContain("DWM");
    unmount();
  });
});
