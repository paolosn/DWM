// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "../../../../../src/renderer/design-system/composites/Pagination/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("Pagination", () => {
  it("deshabilita anterior en la primera página y siguiente en la última", () => {
    const { container, unmount } = mount(
      <Pagination page={1} pageCount={3} onPageChange={vi.fn()} />
    );
    const buttons = container.querySelectorAll("button");
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(false);
    unmount();
  });

  it("llama a onPageChange con la página correcta", () => {
    const onPageChange = vi.fn();
    const { container, unmount } = mount(
      <Pagination page={2} pageCount={5} onPageChange={onPageChange} />
    );
    const buttons = container.querySelectorAll("button");
    click(buttons[1] ?? null);
    expect(onPageChange).toHaveBeenCalledWith(3);
    click(buttons[0] ?? null);
    expect(onPageChange).toHaveBeenCalledWith(1);
    unmount();
  });

  it("muestra el resumen de resultados cuando se provee", () => {
    const { container, unmount } = mount(
      <Pagination page={1} pageCount={2} onPageChange={vi.fn()} totalItems={42} />
    );
    expect(container.textContent).toContain("42 resultados");
    unmount();
  });
});
