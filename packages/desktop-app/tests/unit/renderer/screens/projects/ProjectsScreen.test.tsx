// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectsScreen } from "../../../../../src/renderer/screens/projects/ProjectsScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import {
  NavigationProvider,
  useNavigation,
} from "../../../../../src/renderer/shell/NavigationContext.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

/** Sonda mínima solo para pruebas: hace visible qué sección está activa, para poder comprobar navegaciones reales sin duplicar el Sidebar. */
function ActiveSectionProbe(): JSX.Element {
  const { activeSection } = useNavigation();
  return <span data-testid="active-section">{activeSection}</span>;
}

const originalDwm = window.dwm;

const project1 = {
  id: "p1",
  metadata: {
    id: "p1",
    name: "DWM",
    description: "desc",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
  },
  configuration: { projectPath: "/x/dwm", profileId: "default", usedTools: [], usedAdapters: [] },
  state: "open",
};

function setDwm(overrides: Record<string, unknown> = {}): ReturnType<typeof vi.fn> {
  const invoke = vi
    .fn()
    .mockImplementation((request: { operation: string; payload?: { id?: string } }) => {
      const key =
        request.operation === "projects.get"
          ? `projects.get:${request.payload?.id}`
          : request.operation;
      if (key in overrides) return Promise.resolve(overrides[key]);
      if (request.operation === "projects.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "projects.list",
          data: [],
        });
      }
      if (request.operation === "profiles.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "profiles.list",
          data: ["default"],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 4): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) {
      await Promise.resolve();
    }
  });
}

function mountScreen() {
  return mount(
    <NavigationProvider>
      <ToastProvider>
        <ProjectsScreen />
      </ToastProvider>
    </NavigationProvider>
  );
}

describe("ProjectsScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("combina projects.list y projects.get para mostrar proyectos completos", async () => {
    setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: ["p1"] },
      "projects.get:p1": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: project1,
      },
    });
    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("DWM");
    expect(container.textContent).toContain("/x/dwm");
    expect(container.textContent).toContain("Sin cliente asignado");
    unmount();
  });

  it("migración/compatibilidad: un proyecto con clientId muestra el cliente en vez de 'Sin cliente asignado'", async () => {
    const projectWithClient = {
      ...project1,
      configuration: { ...project1.configuration, clientId: "mci-finance" },
    };
    setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: ["p1"] },
      "projects.get:p1": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: projectWithClient,
      },
    });
    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("mci-finance");
    expect(container.textContent).not.toContain("Sin cliente asignado");
    unmount();
  });

  it("muestra cliente/perfil/sincronización reales en la Card y ofrece Abrir en VS Code, Abrir carpeta y Archivar", async () => {
    const invoke = setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: ["p1"] },
      "projects.get:p1": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: {
          ...project1,
          configuration: { ...project1.configuration, clientId: "mci-finance" },
        },
      },
      "clients.get": {
        success: true,
        requestId: "x",
        operation: "clients.get",
        data: { id: "mci-finance", metadata: { name: "MCI Finance" } },
      },
      "profiles.get": {
        success: true,
        requestId: "x",
        operation: "profiles.get",
        data: { id: "default", metadata: { name: "Kit Backend" } },
      },
      "content-sync.list-catalog": {
        success: true,
        requestId: "x",
        operation: "content-sync.list-catalog",
        data: [{ id: "coordinador", preview: { action: "conflict" } }],
      },
      "projects.open-in-vscode": {
        success: true,
        requestId: "x",
        operation: "projects.open-in-vscode",
        data: { opened: true, message: "VS Code abierto." },
      },
      "projects.archive": {
        success: true,
        requestId: "x",
        operation: "projects.archive",
        data: { ...project1, state: "closed" },
      },
    });
    const { container, unmount } = mountScreen();
    await settle(8);

    expect(container.textContent).toContain("MCI Finance");
    expect(container.textContent).toContain("Kit Backend");
    expect(container.textContent).toContain("Con conflictos");
    expect(container.textContent).toContain("Última actividad:");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Abrir en VS Code"
      ) ?? null
    );
    await settle();
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "projects.open-in-vscode"
      )
    ).toBe(true);

    click(container.querySelector('button[aria-label="Acciones para DWM"]'));
    const archiveItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Archivar"
    );
    click(archiveItem ?? null);
    await settle();
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "projects.archive"
      )
    ).toBe(true);
    unmount();
  });

  it("muestra estado vacío cuando no hay proyectos", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Todavía no hay proyectos");
    unmount();
  });

  it("muestra Cards reales de proyecto directamente, sin alternancia de vista", async () => {
    setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: ["p1"] },
      "projects.get:p1": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: project1,
      },
    });
    const { container, unmount } = mountScreen();
    await settle();

    expect(container.querySelector(".dwm-project-card")).not.toBeNull();
    expect(container.querySelector('button[aria-label="Vista de tarjetas"]')).toBeNull();
    unmount();
  });

  it("abre el detalle del proyecto al pulsar 'Ver proyecto'", async () => {
    setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: ["p1"] },
      "projects.get:p1": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: project1,
      },
    });
    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para DWM"]'));
    const detailItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Ver proyecto"
    );
    click(detailItem ?? null);
    await settle();

    expect(container.querySelectorAll("h1")[0]?.textContent).toBe("DWM");
    expect(container.textContent).toContain("Resumen");
    unmount();
  });

  it("eliminar exige escribir el nombre exacto y envía confirmation:true", async () => {
    const invoke = setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: ["p1"] },
      "projects.get:p1": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: project1,
      },
      "projects.delete": {
        success: true,
        requestId: "x",
        operation: "projects.delete",
        data: { deleted: true },
      },
    });
    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para DWM"]'));
    const deleteItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Eliminar"
    );
    click(deleteItem ?? null);

    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Eliminar" && b.closest('[role="dialog"]')
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    const input = container.querySelector('[role="dialog"] input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "DWM");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(confirmButton.disabled).toBe(false);
    click(confirmButton);
    await settle();

    const deleteCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "projects.delete"
    );
    expect((deleteCall?.[0] as { confirmation: unknown }).confirmation).toEqual({
      confirmed: true,
      token: "p1",
    });
    unmount();
  });
});

describe("ProjectsScreen — reintentar y crear", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("reintentar tras un error vuelve a llamar a projects.list", async () => {
    let shouldFail = true;
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "projects.list") {
        if (shouldFail) {
          return Promise.resolve({
            success: false,
            requestId: "x",
            operation: "projects.list",
            error: { code: "E", message: "fallo", category: "unknown", retryable: true },
          });
        }
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "projects.list",
          data: [],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: vi.fn() },
      configurable: true,
    });

    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("No se pudieron cargar los proyectos");

    shouldFail = false;
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Reintentar"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("Todavía no hay proyectos");
    unmount();
  });

  it("'Nuevo trabajo' navega al provisioning unificado, sin abrir un formulario ni pedir ruta/UUID", async () => {
    setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: [] },
    });
    const { container, unmount } = mount(
      <NavigationProvider>
        <ToastProvider>
          <ActiveSectionProbe />
          <ProjectsScreen />
        </ToastProvider>
      </NavigationProvider>
    );
    await settle();

    expect(container.textContent).toContain("dashboard");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Nuevo trabajo"
      ) ?? null
    );
    await settle();

    // Nunca abre un formulario propio: ni ruta manual, ni selector de perfil por id.
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("provisioning");
    unmount();
  });
});

describe("ProjectsScreen — cancelar, vista de tarjetas y detalle desde tarjeta", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("cancelar eliminación no invoca projects.delete, y 'Crear proyecto' nunca llama a projects.create", async () => {
    const invoke = setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: ["p1"] },
      "projects.get:p1": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: project1,
      },
    });
    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para DWM"]'));
    const deleteItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Eliminar"
    );
    click(deleteItem ?? null);
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "projects.create")
    ).toBe(false);
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "projects.delete")
    ).toBe(false);
    unmount();
  });

  it("abrir el detalle desde la Card ('Abrir proyecto')", async () => {
    setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: ["p1"] },
      "projects.get:p1": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: project1,
      },
    });
    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Abrir proyecto"
      ) ?? null
    );
    await settle();

    expect(container.querySelectorAll("h1")[0]?.textContent).toBe("DWM");
    unmount();
  });

  it("buscar filtra por nombre y ruta en cliente", async () => {
    setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: ["p1"] },
      "projects.get:p1": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: project1,
      },
    });
    const { container, unmount } = mountScreen();
    await settle();

    const search = container.querySelector(
      'input[placeholder="Buscar proyectos"]'
    ) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(search, "no-coincide");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Sin proyectos que coincidan con la búsqueda");
    unmount();
  });
});
