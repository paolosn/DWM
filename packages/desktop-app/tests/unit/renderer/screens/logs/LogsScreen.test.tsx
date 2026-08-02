// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { LogsScreen } from "../../../../../src/renderer/screens/logs/LogsScreen.js";
import { mount } from "../../../support/renderHelpers.js";

describe("LogsScreen", () => {
  it("muestra honestamente que no hay operación pública de logs, sin datos inventados", () => {
    const { container, unmount } = mount(<LogsScreen />);
    expect(container.textContent).toContain("Función no disponible en esta versión");
    expect(container.textContent).toContain("Sin datos que mostrar");
    unmount();
  });
});
