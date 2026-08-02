// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SecretField } from "../../../../../src/renderer/design-system/primitives/SecretField/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("SecretField", () => {
  it("oculta el valor por defecto (type=password)", () => {
    const { container, unmount } = mount(<SecretField label="Token" />);
    expect(container.querySelector("input")?.type).toBe("password");
    unmount();
  });

  it("revela el valor al pulsar el botón y vuelve a ocultarlo", () => {
    const { container, unmount } = mount(<SecretField label="Token" />);
    const toggle = container.querySelector("button");
    click(toggle);
    expect(container.querySelector("input")?.type).toBe("text");
    expect(toggle?.textContent).toBe("Ocultar");
    click(toggle);
    expect(container.querySelector("input")?.type).toBe("password");
    unmount();
  });

  it("desactiva autocompletado y corrección ortográfica", () => {
    const { container, unmount } = mount(<SecretField label="Token" />);
    const input = container.querySelector("input");
    expect(input?.autocomplete).toBe("off");
    expect(input?.getAttribute("spellcheck")).toBe("false");
    unmount();
  });

  it("muestra error asociado", () => {
    const { container, unmount } = mount(<SecretField label="Token" error="Token inválido" />);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Token inválido");
    unmount();
  });
});
