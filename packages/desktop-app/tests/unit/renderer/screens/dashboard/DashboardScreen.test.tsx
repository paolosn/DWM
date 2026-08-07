// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardScreen } from "../../../../../src/renderer/screens/dashboard/DashboardScreen.js";
import {
  NavigationProvider,
  useNavigation,
} from "../../../../../src/renderer/shell/NavigationContext.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

function ActiveSectionProbe(): JSX.Element {
  const { activeSection } = useNavigation();
  return <span data-testid="active-section">{activeSection}</span>;
}

const originalDwm = window.dwm;

function setDwm(overrides: Partial<Record<string, unknown>> = {}): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
    if (request.operation in overrides) {
      return Promise.resolve(overrides[request.operation]);
    }
    return Promise.resolve({
      success: true,
      requestId: "x",
      operation: request.operation,
      data: [],
    });
  });
  Object.defineProperty(window, "dwm", {
    value: {
      invoke,
      getVersionInfo: vi.fn().mockResolvedValue({
        appVersion: "0.1.0",
        apiVersion: "1.0.0",
        minCompatibleApiVersion: "1.0.0",
        platform: "linux",
        electron: "31.0.0",
        chrome: "126.0.0",
        node: "22.0.0",
      }),
    },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) {
      await Promise.resolve();
    }
  });
}

function mountScreen() {
  return mount(
    <NavigationProvider>
      <DashboardScreen />
    </NavigationProvider>
  );
}

describe("DashboardScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra el bloque de bienvenida real y las 4 Cards de acción (Nuevo trabajo → Clientes → Proyectos → Biblioteca IA)", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("Bienvenido a DWM");
    expect(container.textContent).toContain("Tu espacio de trabajo inteligente");
    for (const title of ["Nuevo trabajo", "Clientes", "Proyectos", "Biblioteca IA"]) {
      expect(container.textContent).toContain(title);
    }
    // Orden exacto pedido: Nuevo trabajo, Clientes, Proyectos, Biblioteca IA.
    const cardTitles = Array.from(container.querySelectorAll(".dwm-action-card__title")).map(
      (el) => el.textContent
    );
    expect(cardTitles).toEqual(["Nuevo trabajo", "Clientes", "Proyectos", "Biblioteca IA"]);
    unmount();
  });

  it("las 4 etiquetas de categoría son las reales (EMPEZAR AQUÍ / GESTIÓN / EN CURSO / RECURSOS)", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();

    const eyebrows = Array.from(container.querySelectorAll(".dwm-action-card__eyebrow")).map(
      (el) => el.textContent
    );
    expect(eyebrows).toEqual(["EMPEZAR AQUÍ", "GESTIÓN", "EN CURSO", "RECURSOS"]);
    unmount();
  });

  it("Centro de trabajo se muestra como fila ancha (fuera del grid 2x2), con acceso real", async () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider>
        <ActiveSectionProbe />
        <DashboardScreen />
      </NavigationProvider>
    );
    await settle();

    expect(container.textContent).toContain("Centro de trabajo");
    expect(container.textContent).toContain("Acceso rápido al entorno de desarrollo.");
    click(
      Array.from(container.querySelectorAll(".dwm-dashboard__workspace-button")).find(
        (b) => b.textContent === "Ver"
      ) ?? null
    );
    await settle();
    expect(container.querySelector('[data-testid="active-section"]')?.textContent).toBe(
      "workspace"
    );
    unmount();
  });

  it("muestra las 4 métricas reales (Motor/Proyectos/Backups/Versión), solo dato — sin descripciones ni botones", async () => {
    setDwm({
      "projects.list": {
        success: true,
        requestId: "x",
        operation: "projects.list",
        data: ["p1", "p2"],
      },
      "backups.list": { success: true, requestId: "x", operation: "backups.list", data: ["b1"] },
    });
    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("MOTOR");
    expect(container.textContent).toContain("Operativo");
    expect(container.textContent).toContain("PROYECTOS");
    expect(container.textContent).toContain("BACKUPS");
    expect(container.textContent).toContain("VERSIÓN");
    expect(container.textContent).toContain("0.1.0");

    const values = Array.from(container.querySelectorAll(".dwm-dashboard__metric-value")).map(
      (el) => el.textContent
    );
    expect(values[1]).toBe("2");
    expect(values[2]).toBe("1");
    unmount();
  });

  it("cada Card de acción navega de verdad a su sección real (reutiliza useNavigation, sin mecanismo nuevo)", async () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider>
        <ActiveSectionProbe />
        <DashboardScreen />
      </NavigationProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ver clientes"
      ) ?? null
    );
    await settle();
    expect(container.querySelector('[data-testid="active-section"]')?.textContent).toBe("clients");
    unmount();
  });
});
