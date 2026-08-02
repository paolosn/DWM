// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  NavigationProvider,
  useNavigation,
} from "../../../src/renderer/shell/NavigationContext.js";
import { click, mount } from "../support/renderHelpers.js";

function Probe(): JSX.Element {
  const { activeSection, setActiveSection } = useNavigation();
  return (
    <div>
      <span data-testid="active">{activeSection}</span>
      <button type="button" onClick={() => setActiveSection("projects")}>
        ir a proyectos
      </button>
    </div>
  );
}

describe("NavigationContext", () => {
  it("useNavigation() fuera de un NavigationProvider lanza", () => {
    // React registra un error en consola al lanzar dentro de un render; lo silenciamos aquí.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => mount(<Probe />)).toThrow(/NavigationProvider/);
    spy.mockRestore();
  });

  it("usa 'dashboard' como sección inicial por defecto", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <Probe />
      </NavigationProvider>
    );
    expect(container.querySelector('[data-testid="active"]')?.textContent).toBe("dashboard");
    unmount();
  });

  it("acepta una sección inicial distinta", () => {
    const { container, unmount } = mount(
      <NavigationProvider initialSection="tools">
        <Probe />
      </NavigationProvider>
    );
    expect(container.querySelector('[data-testid="active"]')?.textContent).toBe("tools");
    unmount();
  });

  it("setActiveSection actualiza la sección activa", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <Probe />
      </NavigationProvider>
    );
    const button = container.querySelector("button");
    click(button);
    expect(container.querySelector('[data-testid="active"]')?.textContent).toBe("projects");
    unmount();
  });
});
