// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Breadcrumbs } from "../../../../../src/renderer/design-system/composites/Breadcrumbs/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("Breadcrumbs", () => {
  it("el último elemento es la página actual y no navegable", () => {
    const onNavigate = vi.fn();
    const { container, unmount } = mount(
      <Breadcrumbs
        items={[{ label: "Proyectos", onNavigate }, { label: "MCI Provider Manager" }]}
      />
    );
    const current = container.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("MCI Provider Manager");
    expect(current?.tagName).toBe("SPAN");
    unmount();
  });

  it("navega al pulsar un elemento intermedio", () => {
    const onNavigate = vi.fn();
    const { container, unmount } = mount(
      <Breadcrumbs items={[{ label: "Proyectos", onNavigate }, { label: "Detalle" }]} />
    );
    click(container.querySelector("button"));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    unmount();
  });
});
