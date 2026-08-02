// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RulesScreen } from "../../../../../src/renderer/screens/rules/RulesScreen.js";
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
      <RulesScreen />
    </ToastProvider>
  );
}

describe("RulesScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("carga y muestra reglas reales de rules.list", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "rules.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "rules.list",
          data: [{ id: "r1", title: "Regla Uno", archived: false, createdAt: "x", updatedAt: "y" }],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Regla Uno");
    unmount();
  });

  it("muestra estado vacío cuando no hay reglas", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "rules.list", data: [] });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Todavía no hay reglas");
    unmount();
  });

  it("eliminar exige el id exacto y envía confirmation:true", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "rules.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "rules.list",
          data: [{ id: "r1", title: "Regla Uno", archived: false, createdAt: "x", updatedAt: "y" }],
        });
      }
      if (request.operation === "rules.delete") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "rules.delete",
          data: { deleted: true },
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para Regla Uno"]'));
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
      setter?.call(input, "r1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(confirmButton);
    await settle();

    const deleteCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "rules.delete"
    );
    expect((deleteCall?.[0] as { confirmation: unknown }).confirmation).toEqual({
      confirmed: true,
      token: "r1",
    });
    unmount();
  });
});

describe("RulesScreen — restaurar y reintentar", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("restaurar una regla archivada invoca rules.restore", async () => {
    let archived = true;
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "rules.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "rules.list",
          data: [{ id: "r1", title: "Regla Uno", archived, createdAt: "x", updatedAt: "y" }],
        });
      }
      if (request.operation === "rules.restore") {
        archived = false;
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "rules.restore",
          data: { id: "r1" },
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    click(container.querySelector('button[aria-label="Acciones para Regla Uno"]'));
    const restoreItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Restaurar"
    );
    click(restoreItem ?? null);
    await settle();
    expect(container.textContent).toContain("Activa");
    unmount();
  });

  it("crear una regla envía rules.create con id y content", async () => {
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "rules.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "rules.list",
          data: [],
        });
      }
      if (request.operation === "rules.create") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "rules.create",
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
        (b) => b.textContent === "Crear regla"
      ) ?? null
    );

    const idInput = container.querySelector('[role="dialog"] input') as HTMLInputElement;
    const inputSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      inputSetter?.call(idInput, "nueva");
      idInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const textarea = container.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement;
    const textareaSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    act(() => {
      textareaSetter?.call(textarea, "contenido");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Crear regla"
      ) ?? null
    );
    await settle();

    const createCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "rules.create"
    );
    expect((createCall?.[0] as { payload: unknown }).payload).toEqual({
      id: "nueva",
      content: "contenido",
    });
    unmount();
  });
});

describe("RulesScreen — cancelar creación y eliminación", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("cancelar creación y eliminación no invocan mutaciones", async () => {
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "rules.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "rules.list",
          data: [{ id: "r1", title: "Regla Uno", archived: false, createdAt: "x", updatedAt: "y" }],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear regla"
      ) ?? null
    );
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    click(container.querySelector('button[aria-label="Acciones para Regla Uno"]'));
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
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "rules.delete")
    ).toBe(false);
    unmount();
  });
});
