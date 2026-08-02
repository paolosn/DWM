// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Skeleton } from "../../../../../src/renderer/design-system/composites/Skeleton/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("Skeleton", () => {
  it("se oculta a lectores de pantalla", () => {
    const { container, unmount } = mount(<Skeleton />);
    expect(container.querySelector('[data-testid="skeleton"]')?.getAttribute("aria-hidden")).toBe(
      "true"
    );
    unmount();
  });

  it("aplica width/height/variant personalizados", () => {
    const { container, unmount } = mount(<Skeleton width="40px" height="40px" variant="circle" />);
    const el = container.querySelector('[data-testid="skeleton"]') as HTMLElement;
    expect(el.className).toContain("dwm-skeleton--circle");
    expect(el.style.width).toBe("40px");
    unmount();
  });
});
