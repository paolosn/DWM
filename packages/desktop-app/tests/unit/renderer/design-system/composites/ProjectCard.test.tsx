// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ProjectCard } from "../../../../../src/renderer/design-system/composites/ProjectCard/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("ProjectCard", () => {
  it("renderiza nombre, ruta y estado", () => {
    const { container, unmount } = mount(
      <ProjectCard
        name="DWM"
        path="/Users/paolo/dev/dwm"
        statusLabel="Activo"
        statusTone="success"
      />
    );
    expect(container.querySelector("h3")?.textContent).toBe("DWM");
    expect(container.textContent).toContain("/Users/paolo/dev/dwm");
    unmount();
  });

  it("dispara onOpen al pulsar 'Abrir proyecto'", () => {
    const onOpen = vi.fn();
    const { container, unmount } = mount(
      <ProjectCard name="DWM" path="/x" statusLabel="Activo" statusTone="success" onOpen={onOpen} />
    );
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Abrir proyecto"
      ) ?? null
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
    unmount();
  });
});
