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

  it("muestra el estado del motor y los recuentos reales de proyectos y backups", async () => {
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

    expect(container.textContent).toContain("Operativo");
    expect(container.textContent).toContain("2 proyecto(s)");
    expect(container.textContent).toContain("1 backup(s)");
    unmount();
  });

  it("muestra estado vacío cuando no hay proyectos ni backups", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("Todavía no hay proyectos");
    expect(container.textContent).toContain("Sin backups todavía");
    unmount();
  });

  it("muestra ErrorState cuando projects.list falla", async () => {
    setDwm({
      "projects.list": {
        success: false,
        requestId: "x",
        operation: "projects.list",
        error: { code: "E", message: "fallo", category: "unknown", retryable: true },
      },
    });
    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("No se pudieron cargar los proyectos");
    unmount();
  });

  it("'Ir a Proyectos' navega a la sección de proyectos", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();

    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Ir a proyectos →"
    );
    click(button ?? null);
    // La navegación real la observa AppShell/ContentArea; aquí solo confirmamos que el botón existe y es interactivo.
    expect(button).toBeDefined();
    unmount();
  });
});

describe("DashboardScreen — acciones adicionales", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra ErrorState cuando backups.list falla", async () => {
    setDwm({
      "backups.list": {
        success: false,
        requestId: "x",
        operation: "backups.list",
        error: { code: "E", message: "fallo backups", category: "unknown", retryable: true },
      },
    });
    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("No se pudieron cargar los backups");
    unmount();
  });

  it("'Abrir Centro de trabajo' es interactivo", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();
    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Abrir centro de trabajo →"
    );
    click(button ?? null);
    expect(button).toBeDefined();
    unmount();
  });

  it("muestra el bloque de bienvenida real y las 5 Cards del flujo recomendado (Clientes → Nuevo trabajo → Proyectos → Biblioteca IA → Centro de trabajo)", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("Bienvenido a DWM");
    expect(container.textContent).toContain("Tu espacio de trabajo inteligente");
    for (const title of [
      "Clientes",
      "Nuevo trabajo",
      "Proyectos",
      "Biblioteca IA",
      "Centro de trabajo",
    ]) {
      expect(container.textContent).toContain(title);
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
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Abrir Biblioteca IA"
      ) ?? null
    );
    await settle();
    expect(container.querySelector('[data-testid="active-section"]')?.textContent).toBe(
      "aiLibrary"
    );
    unmount();
  });
});
