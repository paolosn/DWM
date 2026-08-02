// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";
import { HelpScreen } from "../../../../../src/renderer/screens/help/HelpScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

function mountScreen() {
  return mount(
    <ToastProvider>
      <HelpScreen />
    </ToastProvider>
  );
}

describe("HelpScreen", () => {
  it("filtra el contenido local por búsqueda", () => {
    const { container, unmount } = mountScreen();
    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "backups");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Backups y restauración");
    expect(container.textContent).not.toContain("Skills");
    unmount();
  });

  it("muestra 'sin resultados' para una búsqueda sin coincidencias", () => {
    const { container, unmount } = mountScreen();
    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "zzz-no-existe");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Sin resultados para esta búsqueda");
    unmount();
  });

  it("'Reabrir asistente de bienvenida' muestra el Onboarding y 'Volver a Ayuda' regresa", () => {
    const { container, unmount } = mountScreen();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Reabrir asistente de bienvenida"
      ) ?? null
    );
    expect(container.textContent).toContain("Primer inicio");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Volver a Ayuda"
      ) ?? null
    );
    expect(container.textContent).toContain("Contenido local de ayuda sobre DWM.");
    unmount();
  });
});
