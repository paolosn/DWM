// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectsScreen } from "../../../../../src/renderer/screens/projects/ProjectsScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

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
    <ToastProvider>
      <ProjectsScreen />
    </ToastProvider>
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
    unmount();
  });

  it("muestra estado vacío cuando no hay proyectos", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Todavía no hay proyectos");
    unmount();
  });

  it("cambia a vista de tarjetas y muestra ProjectCard", async () => {
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

    click(container.querySelector('button[aria-label="Vista de tarjetas"]'));
    expect(container.querySelector(".dwm-project-card")).not.toBeNull();
    unmount();
  });

  it("abre el detalle del proyecto al pulsar 'Ver detalle'", async () => {
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
      (el) => el.textContent === "Ver detalle"
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

  it("crear un proyecto envía projects.create con configuration completa", async () => {
    const invoke = setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: [] },
      "profiles.list": {
        success: true,
        requestId: "x",
        operation: "profiles.list",
        data: ["default"],
      },
      "projects.create": {
        success: true,
        requestId: "x",
        operation: "projects.create",
        data: project1,
      },
    });
    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear proyecto"
      ) ?? null
    );

    const inputs = container.querySelectorAll('[role="dialog"] input');
    const inputSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    const textareaSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    act(() => {
      inputSetter?.call(inputs[0], "DWM");
      inputs[0]?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const textarea = container.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement;
    act(() => {
      textareaSetter?.call(textarea, "Descripción");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      inputSetter?.call(inputs[1], "/x/dwm");
      inputs[1]?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const select = container.querySelector('[role="dialog"] select') as HTMLSelectElement;
    act(() => {
      select.value = "default";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Crear proyecto"
      ) ?? null
    );
    await settle();

    const createCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "projects.create"
    );
    expect(createCall).toBeDefined();
    unmount();
  });
});

describe("ProjectsScreen — cancelar, vista de tarjetas y detalle desde tarjeta", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("cancelar creación y eliminación no invocan mutaciones", async () => {
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

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear proyecto"
      ) ?? null
    );
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();

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

  it("abrir el detalle desde la tarjeta en vista de tarjetas", async () => {
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

    click(container.querySelector('button[aria-label="Vista de tarjetas"]'));
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
