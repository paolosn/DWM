// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { TextArea } from "../../../../../src/renderer/design-system/primitives/TextArea/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("TextArea", () => {
  it("asocia label y usa 4 filas por defecto", () => {
    const { container, unmount } = mount(<TextArea label="Descripción" />);
    const label = container.querySelector("label");
    const textarea = container.querySelector("textarea");
    expect(label?.getAttribute("for")).toBe(textarea?.id);
    expect(textarea?.rows).toBe(4);
    unmount();
  });

  it("permite sobreescribir rows", () => {
    const { container, unmount } = mount(<TextArea label="Notas" rows={8} />);
    expect(container.querySelector("textarea")?.rows).toBe(8);
    unmount();
  });

  it("muestra error con role=alert y aria-invalid", () => {
    const { container, unmount } = mount(<TextArea label="Notas" error="Demasiado largo" />);
    expect(container.querySelector("textarea")?.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Demasiado largo");
    unmount();
  });
});
