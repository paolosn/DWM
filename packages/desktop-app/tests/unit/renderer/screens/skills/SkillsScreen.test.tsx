// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillsScreen } from "../../../../../src/renderer/screens/skills/SkillsScreen.js";
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
      <SkillsScreen />
    </ToastProvider>
  );
}

describe("SkillsScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("carga y muestra skills reales de skills.list", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "skills.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "skills.list",
          data: [
            {
              id: "s1",
              title: "Skill Uno",
              archived: false,
              createdAt: "x",
              updatedAt: "y",
              hasSkillFile: true,
            },
          ],
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Skill Uno");
    expect(container.textContent).toContain("Presente");
    unmount();
  });

  it("muestra estado vacío cuando no hay skills", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "skills.list", data: [] });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Todavía no hay skills");
    unmount();
  });

  it("archivar invoca skills.archive y refresca la lista", async () => {
    let archived = false;
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "skills.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "skills.list",
          data: [
            {
              id: "s1",
              title: "Skill Uno",
              archived,
              createdAt: "x",
              updatedAt: "y",
              hasSkillFile: true,
            },
          ],
        });
      }
      if (request.operation === "skills.archive") {
        archived = true;
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "skills.archive",
          data: { id: "s1" },
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para Skill Uno"]'));
    const archiveItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Archivar"
    );
    click(archiveItem ?? null);
    await settle();

    expect(container.textContent).toContain("Archivado");
    unmount();
  });

  it("eliminar exige el id exacto y envía confirmation:true", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "skills.list") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "skills.list",
          data: [
            {
              id: "s1",
              title: "Skill Uno",
              archived: false,
              createdAt: "x",
              updatedAt: "y",
              hasSkillFile: true,
            },
          ],
        });
      }
      if (request.operation === "skills.delete") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "skills.delete",
          data: { deleted: true },
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();

    click(container.querySelector('button[aria-label="Acciones para Skill Uno"]'));
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
      setter?.call(input, "s1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(confirmButton.disabled).toBe(false);

    click(confirmButton);
    await settle();

    const deleteCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "skills.delete"
    );
    expect((deleteCall?.[0] as { confirmation: unknown }).confirmation).toEqual({
      confirmed: true,
      token: "s1",
    });
    unmount();
  });
});

describe("SkillsScreen — restaurar y reintentar", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("restaurar una skill archivada invoca skills.restore", async () => {
    let archived = true;
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "skills.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "skills.list",
          data: [
            {
              id: "s1",
              title: "Skill Uno",
              archived,
              createdAt: "x",
              updatedAt: "y",
              hasSkillFile: true,
            },
          ],
        });
      }
      if (request.operation === "skills.restore") {
        archived = false;
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "skills.restore",
          data: { id: "s1" },
        });
      }
      return Promise.reject(new Error(`no mockeada: ${request.operation}`));
    });
    setDwm(invoke);

    const { container, unmount } = mountScreen();
    await settle();
    click(container.querySelector('button[aria-label="Acciones para Skill Uno"]'));
    const restoreItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Restaurar"
    );
    click(restoreItem ?? null);
    await settle();
    expect(container.textContent).toContain("Activo");
    unmount();
  });

  it("reintentar tras un error vuelve a llamar a skills.list", async () => {
    let shouldFail = true;
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "skills.list") {
        if (shouldFail) {
          return Promise.resolve({
            success: false,
            requestId: request.requestId,
            operation: "skills.list",
            error: { code: "E", message: "fallo", category: "unknown", retryable: true },
          });
        }
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "skills.list",
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
    expect(container.textContent).toContain("Todavía no hay skills");
    unmount();
  });
});

describe("SkillsScreen — cancelar creación y eliminación", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("cancelar creación y eliminación no invocan mutaciones", async () => {
    const invoke = vi.fn().mockImplementation((request) => {
      if (request.operation === "skills.list") {
        return Promise.resolve({
          success: true,
          requestId: request.requestId,
          operation: "skills.list",
          data: [
            {
              id: "s1",
              title: "Skill Uno",
              archived: false,
              createdAt: "x",
              updatedAt: "y",
              hasSkillFile: true,
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
        (b) => b.textContent === "Crear skill"
      ) ?? null
    );
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    click(container.querySelector('button[aria-label="Acciones para Skill Uno"]'));
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
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "skills.create")
    ).toBe(false);
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "skills.delete")
    ).toBe(false);
    unmount();
  });
});
