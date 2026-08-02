// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ResourceCard } from "../../../../../src/renderer/design-system/composites/ResourceCard/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("ResourceCard", () => {
  it("no es interactiva cuando no se provee onClick", () => {
    const { container, unmount } = mount(<ResourceCard title="Agente A" />);
    expect(container.querySelector('[role="button"]')).toBeNull();
    unmount();
  });

  it("dispara onClick y responde a Enter cuando es interactiva", () => {
    const onClick = vi.fn();
    const { container, unmount } = mount(<ResourceCard title="Agente A" onClick={onClick} />);
    const card = container.querySelector('[role="button"]') as HTMLElement;
    click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
    card.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );
    expect(onClick).toHaveBeenCalledTimes(2);
    unmount();
  });
});
