// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { StatusBadge } from "../../../../../src/renderer/design-system/primitives/StatusBadge/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("StatusBadge", () => {
  it("usa tono neutral por defecto y muestra el texto del estado", () => {
    const { container, unmount } = mount(<StatusBadge label="Pendiente" />);
    const el = container.querySelector(".dwm-status-badge");
    expect(el?.getAttribute("data-tone")).toBe("neutral");
    expect(el?.textContent).toBe("Pendiente");
    unmount();
  });

  it.each([
    ["success", "Firmado"],
    ["warning", "Próximo a vencer"],
    ["danger", "Vencido"],
    ["accent", "Nuevo"],
  ] as const)("aplica el tono %s", (tone, label) => {
    const { container, unmount } = mount(<StatusBadge label={label} tone={tone} />);
    expect(container.querySelector(".dwm-status-badge")?.getAttribute("data-tone")).toBe(tone);
    unmount();
  });
});
