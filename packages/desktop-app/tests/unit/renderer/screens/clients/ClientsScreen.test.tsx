// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientsScreen } from "../../../../../src/renderer/screens/clients/ClientsScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function setDwm(invoke: (request: unknown) => Promise<unknown>): void {
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
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
    <ToastProvider>
      <ClientsScreen />
    </ToastProvider>
  );
}

describe("ClientsScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("carga y muestra clientes reales de clients.list", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "clients.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "clients.list",
          data: [
            {
              id: "c1",
              name: "MCI Finance",
              slug: "mci-finance",
              status: "active",
              tags: [],
              archived: false,
              createdAt: "x",
              updatedAt: "y",
            },
          ],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("MCI Finance");
    expect(container.textContent).toContain("active");
    unmount();
  });

  it("no ofrece la acción 'Duplicar' (no existe en el contrato de clients)", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "clients.list",
      data: [
        {
          id: "c1",
          name: "MCI Finance",
          slug: "mci-finance",
          status: "active",
          tags: [],
          archived: false,
          createdAt: "x",
          updatedAt: "y",
        },
      ],
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    click(container.querySelector('button[aria-label="Acciones para MCI Finance"]'));
    const labels = Array.from(container.querySelectorAll('[role="menuitem"]')).map(
      (el) => el.textContent
    );
    expect(labels).not.toContain("Duplicar");
    expect(labels).toEqual(["Ver relaciones", "Archivar", "Eliminar"]);
    unmount();
  });

  it("'Ver relaciones' llama a clients.get real y muestra los recursos vinculados", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "clients.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "clients.list",
          data: [
            {
              id: "c1",
              name: "MCI Finance",
              slug: "mci-finance",
              status: "active",
              tags: [],
              archived: false,
              createdAt: "x",
              updatedAt: "y",
            },
          ],
        });
      }
      if (request.operation === "clients.get") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "clients.get",
          data: {
            id: "c1",
            name: "MCI Finance",
            slug: "mci-finance",
            status: "active",
            tags: [],
            references: { projects: ["yndhex"], knowledge: [], agents: [], skills: [], rules: [] },
            dwm: {},
          },
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para MCI Finance"]'));
    const detailItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Ver relaciones"
    );
    click(detailItem ?? null);
    await settle();

    const getCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "clients.get"
    );
    expect((getCall?.[0] as { payload: { id: string } }).payload).toEqual({ id: "c1" });
    expect(container.textContent).toContain("yndhex");
    expect(container.textContent).toContain("Sin conocimiento vinculados.");
    unmount();
  });

  it("eliminar exige el id exacto y envía confirmation:true", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "clients.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "clients.list",
          data: [
            {
              id: "c1",
              name: "MCI Finance",
              slug: "mci-finance",
              status: "active",
              tags: [],
              archived: false,
              createdAt: "x",
              updatedAt: "y",
            },
          ],
        });
      }
      if (request.operation === "clients.delete") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "clients.delete",
          data: { deleted: true },
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para MCI Finance"]'));
    const deleteItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Eliminar"
    );
    click(deleteItem ?? null);

    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Eliminar" && b.closest('[role="dialog"]')
    ) as HTMLButtonElement;
    const input = container.querySelector('[role="dialog"] input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "c1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(confirmButton);
    await settle();

    const deleteCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "clients.delete"
    );
    expect((deleteCall?.[0] as { confirmation: unknown }).confirmation).toEqual({
      confirmed: true,
      token: "c1",
    });
    unmount();
  });
});

describe("ClientsScreen — restaurar, crear y reintentar", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("restaurar un cliente archivado invoca clients.restore", async () => {
    let archived = true;
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "clients.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "clients.list",
          data: [
            {
              id: "c1",
              name: "MCI Finance",
              slug: "mci-finance",
              status: "active",
              tags: [],
              archived,
              createdAt: "x",
              updatedAt: "y",
            },
          ],
        });
      }
      if (request.operation === "clients.restore") {
        archived = false;
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "clients.restore",
          data: { id: "c1" },
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    click(container.querySelector('button[aria-label="Acciones para MCI Finance"]'));
    const restoreItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Restaurar"
    );
    click(restoreItem ?? null);
    await settle();
    expect(container.textContent).toContain("Activo");
    unmount();
  });

  it("crear un cliente envía clients.create con los campos completos", async () => {
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "clients.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "clients.list",
          data: [],
        });
      }
      if (request.operation === "clients.create") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "clients.create",
          data: {},
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear cliente"
      ) ?? null
    );

    const inputs = container.querySelectorAll('[role="dialog"] input');
    const inputSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      inputSetter?.call(inputs[0], "mci-finance");
      inputs[0]?.dispatchEvent(new Event("input", { bubbles: true }));
      inputSetter?.call(inputs[1], "MCI Finance");
      inputs[1]?.dispatchEvent(new Event("input", { bubbles: true }));
      inputSetter?.call(inputs[2], "mci-finance");
      inputs[2]?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Crear cliente"
      ) ?? null
    );
    await settle();

    const createCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "clients.create"
    );
    expect(
      (createCall?.[0] as { payload: { id: string; name: string; slug: string } }).payload
    ).toEqual({
      id: "mci-finance",
      name: "MCI Finance",
      slug: "mci-finance",
    });
    unmount();
  });

  it("reintentar tras un error vuelve a llamar a clients.list", async () => {
    let shouldFail = true;
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "clients.list") {
        if (shouldFail) {
          return Promise.resolve({
            success: false,
            requestId: request.requestId,
            operation: "clients.list",
            error: { code: "E", message: "fallo", category: "unknown", retryable: true },
          });
        }
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "clients.list",
          data: [],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    shouldFail = false;
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Reintentar"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("Todavía no hay clientes");
    unmount();
  });
});

describe("ClientsScreen — cancelar creación y ver relaciones desde el menú", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("cancelar el formulario de creación cierra el drawer sin llamar a clients.create", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "clients.list", data: [] });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear cliente"
      ) ?? null
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "clients.create")
    ).toBe(false);
    unmount();
  });

  it("cancelar la eliminación cierra el diálogo sin llamar a clients.delete", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "clients.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "clients.list",
          data: [
            {
              id: "c1",
              name: "MCI Finance",
              slug: "mci-finance",
              status: "active",
              tags: [],
              archived: false,
              createdAt: "x",
              updatedAt: "y",
            },
          ],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();
    click(container.querySelector('button[aria-label="Acciones para MCI Finance"]'));
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
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "clients.delete")
    ).toBe(false);
    unmount();
  });
});
