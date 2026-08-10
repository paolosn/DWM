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

  it("muestra la cabecera real, el bloque de bienvenida y las métricas reales (proyectos/backups/versión)", async () => {
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

    expect(container.textContent).toContain("Sin proyecto activo");
    expect(container.textContent).toContain("Motor DWM operativo");
    expect(container.textContent).toContain("Bienvenido a DWM");
    expect(container.textContent).toContain("Tu espacio de trabajo inteligente.");
    expect(container.textContent).toContain("Operativo");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("0.1.0");
    unmount();
  });

  it("con 0 proyectos y 0 backups, las métricas muestran 0 realmente (sin EmptyState en este bloque)", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("PROYECTOS");
    expect(container.textContent).toContain("BACKUPS");
    unmount();
  });

  it("muestra las 4 Cards del flujo (2x2) con sus etiquetas de categoría reales, y la fila ancha de Centro de trabajo", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();

    for (const title of ["Nuevo trabajo", "Clientes", "Proyectos", "Biblioteca IA", "Centro de trabajo"]) {
      expect(container.textContent).toContain(title);
    }
    for (const eyebrow of ["EMPEZAR AQUÍ", "GESTIÓN", "EN CURSO", "RECURSOS"]) {
      expect(container.textContent).toContain(eyebrow);
    }
    unmount();
  });

  it("cada Card del flujo navega de verdad a su sección real (reutiliza useNavigation, sin mecanismo nuevo)", async () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider>
        <ActiveSectionProbe />
        <DashboardScreen />
      </NavigationProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Abrir") ?? null
    );
    await settle();
    expect(container.querySelector('[data-testid="active-section"]')?.textContent).toBe(
      "aiLibrary"
    );
    unmount();
  });

  it("'Ver' en la fila de Centro de trabajo navega de verdad a esa sección", async () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider>
        <ActiveSectionProbe />
        <DashboardScreen />
      </NavigationProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Ver") ?? null
    );
    await settle();
    expect(container.querySelector('[data-testid="active-section"]')?.textContent).toBe(
      "workspace"
    );
    unmount();
  });
});
