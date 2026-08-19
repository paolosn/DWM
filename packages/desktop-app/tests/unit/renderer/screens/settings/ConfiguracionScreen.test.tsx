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
  it("lista las secciones técnicas/avanzadas reales, sin duplicar ninguna pantalla", () => {
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

  it("'Abrir' en la tarjeta de Perfiles navega a la pantalla real ya existente, reutilizando la misma navegación de toda la app", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <ActiveSectionProbe />
        <ConfiguracionScreen />
      </NavigationProvider>
    );

    const cards = Array.from(container.querySelectorAll(".dwm-configuracion-screen__card"));
    const profilesCard = cards.find((c) => c.textContent?.includes("Perfiles"));
    click(
      Array.from(profilesCard?.querySelectorAll("button") ?? []).find(
        (b) => b.textContent === "Abrir"
      ) ?? null
    );

    expect(container.querySelector('[data-testid="active-section"]')?.textContent).toBe("profiles");
    unmount();
  });

  it("agrupa las secciones reales en 5 categorías (Sistema, Herramientas, IA, Conocimiento, Ayuda), no como lista plana", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <ConfiguracionScreen />
      </NavigationProvider>
    );

    const groupTitles = Array.from(container.querySelectorAll("h3")).map((h) => h.textContent);
    expect(groupTitles).toEqual(["Sistema", "Herramientas", "IA", "Conocimiento", "Ayuda"]);
    expect(container.textContent).toContain(
      "Kits de trabajo y configuración de proveedores/modelos."
    );

    const cards = Array.from(container.querySelectorAll(".dwm-configuracion-screen__card"));
    const sistemaTitles = ["Workspaces", "Backups", "Estado y diagnóstico", "Logs"];
    for (const title of sistemaTitles) {
      expect(cards.some((c) => c.textContent?.includes(title))).toBe(true);
    }
    expect(cards.some((c) => c.textContent?.includes("Configuración avanzada"))).toBe(true);
    expect(cards.some((c) => c.textContent?.includes("Biblioteca IA"))).toBe(true);

    const herramientasTitles = ["Herramientas", "Extensiones de DWM", "Paquetes"];
    for (const title of herramientasTitles) {
      expect(cards.some((c) => c.textContent?.includes(title))).toBe(true);
    }

    // Bloque 3: IA + Conocimiento comparten UNA sola rejilla de 3 columnas real.
    const iaConocimientoRow = Array.from(
      container.querySelectorAll(".dwm-configuracion-screen__row-3")
    ).find(
      (row) => row.textContent?.includes("Conocimiento") && row.textContent?.includes("Perfiles")
    );
    expect(iaConocimientoRow).toBeDefined();

    unmount();
  });
});
