// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Card } from "../../../../../src/renderer/design-system/primitives/Card/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("Card", () => {
  it("renderiza su contenido con padding por defecto", () => {
    const { container, unmount } = mount(<Card>contenido</Card>);
    const el = container.querySelector(".dwm-card");
    expect(el?.className).toContain("dwm-card--padded");
    expect(el?.textContent).toBe("contenido");
    unmount();
  });

  it("permite desactivar el padding", () => {
    const { container, unmount } = mount(<Card padded={false}>x</Card>);
    expect(container.querySelector(".dwm-card")?.className).not.toContain("dwm-card--padded");
    unmount();
  });
});
