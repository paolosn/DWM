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

  it("'Abrir' en cada fila navega a la pantalla real ya existente, reutilizando la misma navegación de toda la app", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <ActiveSectionProbe />
        <ConfiguracionScreen />
      </NavigationProvider>
    );

    const rows = Array.from(container.querySelectorAll("li"));
    const profilesRow = rows.find((row) => row.textContent?.includes("Perfiles"));
    click(
      Array.from(profilesRow?.querySelectorAll("button") ?? []).find(
        (b) => b.textContent === "Abrir"
      ) ?? null
    );

    expect(container.querySelector('[data-testid="active-section"]')?.textContent).toBe("profiles");
    unmount();
  });
});
