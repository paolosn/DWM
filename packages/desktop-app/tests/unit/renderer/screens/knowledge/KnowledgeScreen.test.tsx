// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeScreen } from "../../../../../src/renderer/screens/knowledge/KnowledgeScreen.js";
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
      <KnowledgeScreen />
    </ToastProvider>
  );
}

function typeInSearch(container: HTMLElement, value: string): void {
  const input = container.querySelector(
    'input[placeholder="Buscar en Conocimiento"]'
  ) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("KnowledgeScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("carga con knowledge.list cuando no hay búsqueda activa", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "knowledge.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "knowledge.list",
          data: [
            {
              id: "n1",
              title: "Nota uno",
              archived: false,
              createdAt: "x",
              updatedAt: "y",
              tags: [],
              relations: [],
            },
          ],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("Nota uno");
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "knowledge.search"
      )
    ).toBe(false);
    unmount();
  });

  it("al escribir en el buscador, usa knowledge.search real en vez de filtrar localmente", async () => {
    const invoke = vi
      .fn()
      .mockImplementation((request: { operation: string; payload?: { query?: string } }) => {
        if (request.operation === "knowledge.list") {
          return Promise.resolve({
            success: true,
            requestId: "x",
            operation: "knowledge.list",
            data: [
              {
                id: "n1",
                title: "Nota uno",
                archived: false,
                createdAt: "x",
                updatedAt: "y",
                tags: [],
                relations: [],
              },
            ],
          });
        }
        if (request.operation === "knowledge.search") {
          return Promise.resolve({
            success: true,
            requestId: "x",
            operation: "knowledge.search",
            data: [
              {
                id: "n2",
                title: "Resultado de búsqueda",
                archived: false,
                createdAt: "x",
                updatedAt: "y",
                tags: [],
                relations: [],
              },
            ],
          });
        }
        return Promise.reject(new Error(`no mockeada: ${request.operation}`));
      });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Nota uno");

    typeInSearch(container, "backend");
    await settle();

    const searchCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "knowledge.search"
    );
    expect(searchCall).toBeDefined();
    expect((searchCall?.[0] as { payload: { query: string } }).payload).toEqual({
      query: "backend",
    });

    expect(container.textContent).toContain("Resultado de búsqueda");
    expect(container.textContent).not.toContain("Nota uno");
    unmount();
  });

  it("oculta el filtro de archivados mientras hay una búsqueda activa", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "knowledge.list", data: [] });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Incluir archivados");

    typeInSearch(container, "algo");
    await settle();
    expect(container.textContent).not.toContain("Incluir archivados");
    unmount();
  });

  it("eliminar exige el id exacto y envía confirmation:true a knowledge.delete", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "knowledge.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "knowledge.list",
          data: [
            {
              id: "n1",
              title: "Nota uno",
              archived: false,
              createdAt: "x",
              updatedAt: "y",
              tags: [],
              relations: [],
            },
          ],
        });
      }
      if (request.operation === "knowledge.delete") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "knowledge.delete",
          data: { deleted: true },
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para Nota uno"]'));
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
      setter?.call(input, "n1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(confirmButton.disabled).toBe(false);

    click(confirmButton);
    await settle();

    const deleteCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "knowledge.delete"
    );
    expect((deleteCall?.[0] as { confirmation: unknown }).confirmation).toEqual({
      confirmed: true,
      token: "n1",
    });
    unmount();
  });
});

describe("KnowledgeScreen — restaurar y crear", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("restaurar un elemento archivado invoca knowledge.restore", async () => {
    let archived = true;
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "knowledge.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "knowledge.list",
          data: [
            {
              id: "n1",
              title: "Nota uno",
              archived,
              createdAt: "x",
              updatedAt: "y",
              tags: [],
              relations: [],
            },
          ],
        });
      }
      if (request.operation === "knowledge.restore") {
        archived = false;
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "knowledge.restore",
          data: { id: "n1" },
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    click(container.querySelector('button[aria-label="Acciones para Nota uno"]'));
    const restoreItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Restaurar"
    );
    click(restoreItem ?? null);
    await settle();
    expect(container.textContent).toContain("Activo");
    unmount();
  });

  it("crear un elemento envía knowledge.create con los campos completos", async () => {
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "knowledge.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "knowledge.list",
          data: [],
        });
      }
      if (request.operation === "knowledge.create") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "knowledge.create",
          data: { id: "nueva", content: "x", metadata: {} },
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear elemento"
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
      inputSetter?.call(inputs[0], "nueva");
      inputs[0]?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const textarea = container.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement;
    act(() => {
      textareaSetter?.call(textarea, "contenido");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      inputSetter?.call(inputs[1], "tag1, tag2");
      inputs[1]?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      inputSetter?.call(inputs[2], "categoria");
      inputs[2]?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Crear elemento"
      ) ?? null
    );
    await settle();

    const createCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "knowledge.create"
    );
    expect((createCall?.[0] as { payload: unknown }).payload).toEqual({
      id: "nueva",
      content: "contenido",
      tags: ["tag1", "tag2"],
      category: "categoria",
    });
    unmount();
  });
});

describe("KnowledgeScreen — cancelar creación y eliminación", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("cancelar creación y eliminación no invocan mutaciones", async () => {
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "knowledge.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "knowledge.list",
          data: [
            {
              id: "n1",
              title: "Nota uno",
              archived: false,
              createdAt: "x",
              updatedAt: "y",
              tags: [],
              relations: [],
            },
          ],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear elemento"
      ) ?? null
    );
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    click(container.querySelector('button[aria-label="Acciones para Nota uno"]'));
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
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "knowledge.delete"
      )
    ).toBe(false);
    unmount();
  });
});
