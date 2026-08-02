// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "../../../../../src/renderer/shell/CommandPalette/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function setDwm(overrides: Record<string, unknown> = {}): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
    if (request.operation in overrides) return Promise.resolve(overrides[request.operation]);
    return Promise.resolve({
      success: true,
      requestId: "x",
      operation: request.operation,
      data: [],
    });
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

function setValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("CommandPalette", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("no renderiza nada cuando open=false", () => {
    setDwm();
    const { container, unmount } = mount(
      <CommandPalette open={false} onClose={vi.fn()} onNavigate={vi.fn()} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    unmount();
  });

  it("sin texto, muestra el grupo de Acciones con las 8 secciones reales", () => {
    setDwm();
    const { container, unmount } = mount(
      <CommandPalette open onClose={vi.fn()} onNavigate={vi.fn()} />
    );
    expect(container.textContent).toContain("Acciones");
    expect(container.textContent).toContain("Ir a Agentes");
    unmount();
  });

  it("busca en agents.list y knowledge.search reales al escribir", async () => {
    const invoke = setDwm({
      "agents.list": {
        success: true,
        requestId: "x",
        operation: "agents.list",
        data: [
          { id: "a1", name: "Agente Backend", archived: false, createdAt: "x", updatedAt: "y" },
        ],
      },
      "knowledge.search": {
        success: true,
        requestId: "x",
        operation: "knowledge.search",
        data: [
          {
            id: "k1",
            title: "Nota backend",
            archived: false,
            createdAt: "x",
            updatedAt: "y",
            tags: [],
            relations: [],
          },
        ],
      },
    });
    const { container, unmount } = mount(
      <CommandPalette open onClose={vi.fn()} onNavigate={vi.fn()} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    setValue(input, "backend");
    await settle();

    expect(container.textContent).toContain("Agente Backend");
    expect(container.textContent).toContain("Nota backend");
    const searchCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "knowledge.search"
    );
    expect((searchCall?.[0] as { payload: { query: string } }).payload).toEqual({
      query: "backend",
    });
    unmount();
  });

  it("seleccionar un resultado navega a su sección y cierra el palette", async () => {
    setDwm({
      "clients.list": {
        success: true,
        requestId: "x",
        operation: "clients.list",
        data: [
          {
            id: "c1",
            name: "MCI Finance",
            slug: "mci",
            status: "active",
            tags: [],
            archived: false,
            createdAt: "x",
            updatedAt: "y",
          },
        ],
      },
    });
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const { container, unmount } = mount(
      <CommandPalette open onClose={onClose} onNavigate={onNavigate} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    setValue(input, "mci");
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "MCI Finance"
      ) ?? null
    );
    expect(onNavigate).toHaveBeenCalledWith("clients");
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("cierra con Escape", () => {
    setDwm();
    const onClose = vi.fn();
    const { container, unmount } = mount(
      <CommandPalette open onClose={onClose} onNavigate={vi.fn()} />
    );
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("muestra 'Sin resultados' cuando ninguna fuente coincide", async () => {
    setDwm();
    const { container, unmount } = mount(
      <CommandPalette open onClose={vi.fn()} onNavigate={vi.fn()} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    setValue(input, "zzz-no-existe");
    await settle();
    expect(container.textContent).toContain("Sin resultados");
    unmount();
  });
});
