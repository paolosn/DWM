// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ConfiguracionScreen } from "../../../../../src/renderer/screens/settings/ConfiguracionScreen.js";
import {
  NavigationProvider,
  useNavigation,
} from "../../../../../src/renderer/shell/NavigationContext.js";
import { click, mount } from "../../../support/renderHelpers.js";

function ActiveSectionProbe(): JSX.Element {
  const { activeSection } = useNavigation();
  return <span data-testid="active-section">{activeSection}</span>;
}

describe("ConfiguracionScreen", () => {
  it("lista las 13 secciones técnicas/avanzadas reales, sin duplicar ninguna pantalla", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <ConfiguracionScreen />
      </NavigationProvider>
    );

    for (const label of [
      "Perfiles",
      "Workspaces",
      "IA y modelos",
      "Conocimiento",
      "Herramientas",
      "Extensiones de DWM",
      "Paquetes",
      "Backups",
      "Logs",
      "Estado y diagnóstico",
      "Configuración avanzada",
      "Ayuda",
      "Acerca de DWM",
    ]) {
      expect(container.textContent).toContain(label);
    }
    unmount();
  });

  it("'Abrir' en cada Card navega a la pantalla real ya existente, reutilizando la misma navegación de toda la app", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <ActiveSectionProbe />
        <ConfiguracionScreen />
      </NavigationProvider>
    );

    const cards = Array.from(container.querySelectorAll(".dwm-action-card"));
    const profilesCard = cards.find((card) => card.textContent?.includes("Perfiles"));
    click(
      Array.from(profilesCard?.querySelectorAll("button") ?? []).find(
        (b) => b.textContent === "Abrir"
      ) ?? null
    );

    expect(container.querySelector('[data-testid="active-section"]')?.textContent).toBe("profiles");
    unmount();
  });

  it("las 6 categorías reales aparecen en el orden exacto de la referencia (Sistema, Herramientas, IA, Conocimiento, Diagnóstico, Ayuda)", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <ConfiguracionScreen />
      </NavigationProvider>
    );

    const groupTitles = Array.from(container.querySelectorAll("h2")).map((h) => h.textContent);
    expect(groupTitles).toEqual([
      "Sistema",
      "Herramientas",
      "IA",
      "Conocimiento",
      "Diagnóstico",
      "Ayuda",
    ]);
    unmount();
  });

  it("IA y Conocimiento comparten fila con exactamente 3 columnas reales (mismo contenedor, no dos grids independientes)", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <ConfiguracionScreen />
      </NavigationProvider>
    );

    const combinedRow = container.querySelector(
      ".dwm-configuracion-screen__combined-3"
    ) as HTMLElement;
    expect(combinedRow).not.toBeNull();
    expect(combinedRow.textContent).toContain("IA y modelos");
    expect(combinedRow.textContent).toContain("Perfiles");
    expect(combinedRow.textContent).toContain("Conocimiento");

    const cardsInRow = combinedRow.querySelectorAll(".dwm-action-card");
    expect(cardsInRow).toHaveLength(3);
    unmount();
  });

  it("Diagnóstico y Ayuda comparten fila con exactamente 4 columnas reales (2 + 2)", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <ConfiguracionScreen />
      </NavigationProvider>
    );

    const combinedRow = container.querySelector(
      ".dwm-configuracion-screen__combined-4"
    ) as HTMLElement;
    expect(combinedRow).not.toBeNull();
    expect(combinedRow.textContent).toContain("Estado y diagnóstico");
    expect(combinedRow.textContent).toContain("Logs");
    expect(combinedRow.textContent).toContain("Acerca de DWM");

    const cardsInRow = combinedRow.querySelectorAll(".dwm-action-card");
    expect(cardsInRow).toHaveLength(4);
    unmount();
  });

  it("cada categoría muestra su contador real como píldora junto al título", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <ConfiguracionScreen />
      </NavigationProvider>
    );

    const sistemaHeader = Array.from(container.querySelectorAll(".dwm-section-header")).find(
      (h) => h.querySelector("h2")?.textContent === "Sistema"
    ) as HTMLElement;
    expect(sistemaHeader.textContent).toContain("3");

    const conocimientoHeader = Array.from(container.querySelectorAll(".dwm-section-header")).find(
      (h) => h.querySelector("h2")?.textContent === "Conocimiento"
    ) as HTMLElement;
    expect(conocimientoHeader.textContent).toContain("1");
    unmount();
  });
});
