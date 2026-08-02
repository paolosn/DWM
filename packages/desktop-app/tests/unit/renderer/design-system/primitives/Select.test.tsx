// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Select } from "../../../../../src/renderer/design-system/primitives/Select/index.js";
import { mount } from "../../../support/renderHelpers.js";

const options = [
  { value: "es", label: "España" },
  { value: "mx", label: "México" },
];

describe("Select", () => {
  it("renderiza el placeholder como opción deshabilitada cuando no hay valor", () => {
    const { container, unmount } = mount(
      <Select label="País" options={options} placeholder="Elige un país" onChange={vi.fn()} />
    );
    const opts = Array.from(container.querySelectorAll("option"));
    expect(opts[0]?.textContent).toBe("Elige un país");
    expect(opts[0]?.disabled).toBe(true);
    unmount();
  });

  it("renderiza todas las opciones dadas", () => {
    const { container, unmount } = mount(
      <Select label="País" options={options} onChange={vi.fn()} />
    );
    expect(container.querySelectorAll("option").length).toBe(2);
    unmount();
  });

  it("dispara onChange al seleccionar", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(
      <Select label="País" options={options} onChange={onChange} />
    );
    const select = container.querySelector("select");
    if (select) {
      select.value = "mx";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    expect(onChange).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("muestra error asociado", () => {
    const { container, unmount } = mount(
      <Select label="País" options={options} onChange={vi.fn()} error="Selecciona un país" />
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Selecciona un país");
    unmount();
  });
});
