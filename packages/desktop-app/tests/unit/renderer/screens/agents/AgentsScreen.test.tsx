// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentsScreen } from "../../../../../src/renderer/screens/agents/AgentsScreen.js";
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
      <AgentsScreen />
    </ToastProvider>
  );
}

describe("AgentsScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("carga y muestra los agentes reales de agents.list", async () => {
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "agents.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "agents.list",
          data: [
            {
              id: "a1",
              name: "Agente Uno",
              archived: false,
              createdAt: "2026-01-01",
              updatedAt: "2026-01-02",
            },
          ],
        });
      }
      return Promise.reject(new Error(`operación no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("Agente Uno");
    unmount();
  });

  it("muestra estado vacío cuando agents.list devuelve una lista vacía", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "agents.list",
      data: [],
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("Todavía no hay agentes");
    unmount();
  });

  it("muestra ErrorState cuando agents.list falla", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: false,
      requestId: "x",
      operation: "agents.list",
      error: { code: "E", message: "Fallo de lectura", category: "unknown", retryable: true },
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("No se pudieron cargar los agentes");
    unmount();
  });

  it("archivar un agente invoca agents.archive con confirmación implícita y refresca la lista", async () => {
    let archived = false;
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "agents.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "agents.list",
          data: archived
            ? [{ id: "a1", name: "Agente Uno", archived: true, createdAt: "x", updatedAt: "y" }]
            : [{ id: "a1", name: "Agente Uno", archived: false, createdAt: "x", updatedAt: "y" }],
        });
      }
      if (request.operation === "agents.archive") {
        archived = true;
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "agents.archive",
          data: { id: "a1" },
        });
      }
      return Promise.reject(new Error(`operación no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para Agente Uno"]'));
    const archiveItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Archivar"
    );
    click(archiveItem ?? null);
    await settle();

    const archiveCall = invoke.mock.calls.find(
      (call) => (call[0] as { operation: string }).operation === "agents.archive"
    );
    expect(archiveCall?.[0].payload).toEqual({ id: "a1" });
    expect(container.textContent).toContain("Archivado");
    unmount();
  });

  it("eliminar exige escribir el id exacto antes de habilitar la confirmación, y envía confirmation:true", async () => {
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "agents.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "agents.list",
          data: [{ id: "a1", name: "Agente Uno", archived: false, createdAt: "x", updatedAt: "y" }],
        });
      }
      if (request.operation === "agents.delete") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "agents.delete",
          data: { deleted: true },
        });
      }
      return Promise.reject(new Error(`operación no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para Agente Uno"]'));
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
      setter?.call(input, "a1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(confirmButton.disabled).toBe(false);

    click(confirmButton);
    await settle();

    const deleteCall = invoke.mock.calls.find(
      (call) => (call[0] as { operation: string }).operation === "agents.delete"
    );
    expect(deleteCall?.[0].payload).toEqual({ id: "a1" });
    expect(deleteCall?.[0].confirmation).toEqual({ confirmed: true, token: "a1" });
    unmount();
  });

  it("crear un agente valida y envía agents.create con los datos parseados", async () => {
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "agents.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "agents.list",
          data: [],
        });
      }
      if (request.operation === "agents.create") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "agents.create",
          data: { id: "nuevo", data: { name: "Nuevo" }, metadata: {} },
        });
      }
      return Promise.reject(new Error(`operación no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear agente"
      ) ?? null
    );

    const idInput = container.querySelector('[role="dialog"] input') as HTMLInputElement;
    const inputSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      inputSetter?.call(idInput, "nuevo");
      idInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const textarea = container.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement;
    const textareaSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    act(() => {
      textareaSetter?.call(textarea, '{"name":"Nuevo"}');
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Crear agente"
      ) ?? null
    );
    await settle();

    const createCall = invoke.mock.calls.find(
      (call) => (call[0] as { operation: string }).operation === "agents.create"
    );
    expect(createCall?.[0].payload).toEqual({ id: "nuevo", data: { name: "Nuevo" } });
    unmount();
  });
});

describe("AgentsScreen — restaurar y reintentar", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("restaurar un agente archivado invoca agents.restore y refresca la lista", async () => {
    let archived = true;
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "agents.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "agents.list",
          data: [{ id: "a1", name: "Agente Uno", archived, createdAt: "x", updatedAt: "y" }],
        });
      }
      if (request.operation === "agents.restore") {
        archived = false;
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "agents.restore",
          data: { id: "a1" },
        });
      }
      return Promise.reject(new Error(`operación no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para Agente Uno"]'));
    const restoreItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Restaurar"
    );
    click(restoreItem ?? null);
    await settle();

    expect(container.textContent).toContain("Activo");
    unmount();
  });

  it("reintentar tras un error vuelve a llamar a agents.list", async () => {
    let shouldFail = true;
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "agents.list") {
        if (shouldFail) {
          return Promise.resolve({
            success: false,
            requestId: request.requestId,
            operation: "agents.list",
            error: { code: "E", message: "fallo", category: "unknown", retryable: true },
          });
        }
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "agents.list",
          data: [],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("No se pudieron cargar los agentes");

    shouldFail = false;
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Reintentar"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("Todavía no hay agentes");
    unmount();
  });
});

describe("AgentsScreen — cancelar creación y eliminación", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("cancelar creación y eliminación no invocan mutaciones", async () => {
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "agents.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "agents.list",
          data: [{ id: "a1", name: "Agente Uno", archived: false, createdAt: "x", updatedAt: "y" }],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear agente"
      ) ?? null
    );
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    click(container.querySelector('button[aria-label="Acciones para Agente Uno"]'));
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
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "agents.delete")
    ).toBe(false);
    unmount();
  });
});
