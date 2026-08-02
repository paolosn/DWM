// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Timeline } from "../../../../../src/renderer/design-system/composites/Timeline/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("Timeline", () => {
  it("muestra el mensaje vacío cuando no hay entradas", () => {
    const { container, unmount } = mount(<Timeline entries={[]} emptyLabel="Nada por aquí" />);
    expect(container.textContent).toBe("Nada por aquí");
    unmount();
  });

  it("renderiza cada entrada con título y timestamp", () => {
    const { container, unmount } = mount(
      <Timeline
        entries={[
          { id: "1", title: "Backup creado", timestamp: "hace 2 min" },
          {
            id: "2",
            title: "Sesión reanudada",
            timestamp: "hace 1 h",
            description: "Proyecto DWM",
          },
        ]}
      />
    );
    expect(container.querySelectorAll("li").length).toBe(2);
    expect(container.textContent).toContain("Backup creado");
    expect(container.textContent).toContain("Proyecto DWM");
    unmount();
  });
});
