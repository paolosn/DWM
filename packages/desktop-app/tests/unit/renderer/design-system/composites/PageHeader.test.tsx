// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PageHeader } from "../../../../../src/renderer/design-system/composites/PageHeader/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("PageHeader", () => {
  it("renderiza título como h1 y descripción", () => {
    const { container, unmount } = mount(
      <PageHeader title="Proyectos" description="Todos tus proyectos DWM" />
    );
    expect(container.querySelector("h1")?.textContent).toBe("Proyectos");
    expect(container.textContent).toContain("Todos tus proyectos DWM");
    unmount();
  });

  it("renderiza breadcrumbs y acciones cuando se proveen", () => {
    const { container, unmount } = mount(
      <PageHeader
        title="Detalle"
        breadcrumbs={[{ label: "Proyectos" }, { label: "Detalle" }]}
        actions={<button type="button">Nuevo</button>}
      />
    );
    expect(container.querySelector("nav")).not.toBeNull();
    expect(container.querySelector("button")?.textContent).toBe("Nuevo");
    unmount();
  });

  it("omite breadcrumbs cuando no se proveen", () => {
    const { container, unmount } = mount(<PageHeader title="Solo título" />);
    expect(container.querySelector("nav")).toBeNull();
    unmount();
  });
});
