// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDwmQuery } from "../../../../src/renderer/api-client/index.js";
import { useDwmMutation } from "../../../../src/renderer/api-client/index.js";
import { __resetQueryCacheForTests } from "../../../../src/renderer/api-client/queryCache.js";
import { mount } from "../../support/renderHelpers.js";

function Probe({ includeArchived = false }: { readonly includeArchived?: boolean }): JSX.Element {
  const { status, data, error } = useDwmQuery("agents.list" as never, { includeArchived } as never);
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="data">{data ? JSON.stringify(data) : ""}</span>
      <span data-testid="error">{error?.message ?? ""}</span>
    </div>
  );
}

describe("useDwmQuery", () => {
  const originalDwm = window.dwm;

  beforeEach(() => {
    __resetQueryCacheForTests();
  });

  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("pasa por loading y llega a success con los datos", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "agents.list",
      data: [{ id: "a1" }],
    });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: vi.fn() },
      configurable: true,
    });

    const { container, unmount } = mount(<Probe />);
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("loading");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("success");
    expect(container.querySelector('[data-testid="data"]')?.textContent).toBe('[{"id":"a1"}]');
    unmount();
  });

  it("expone el error cuando la operación falla", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: false,
      requestId: "x",
      operation: "agents.list",
      error: {
        code: "E",
        message: "No se pudo listar agentes",
        category: "unknown",
        retryable: true,
      },
    });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: vi.fn() },
      configurable: true,
    });

    const { container, unmount } = mount(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("error");
    expect(container.querySelector('[data-testid="error"]')?.textContent).toBe(
      "No se pudo listar agentes"
    );
    unmount();
  });

  it("no repite la llamada cuando el payload no cambia entre renders", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "agents.list", data: [] });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: vi.fn() },
      configurable: true,
    });

    const { root, unmount } = mount(<Probe includeArchived={false} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      root.render(<Probe includeArchived={false} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    unmount();
  });
});

function AgentsListWithCreate(): JSX.Element {
  const query = useDwmQuery("agents.list" as never, {} as never);
  const mutation = useDwmMutation("agents.create" as never, { invalidates: ["agents.list"] });
  return (
    <div>
      <span data-testid="status">{query.status}</span>
      <span data-testid="data">{query.data ? JSON.stringify(query.data) : ""}</span>
      <button type="button" onClick={() => void mutation.mutate({ id: "a2" } as never)}>
        Crear
      </button>
    </div>
  );
}

describe("useDwmQuery + useDwmMutation invalidation", () => {
  const originalDwm = window.dwm;

  beforeEach(() => {
    __resetQueryCacheForTests();
  });

  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("refresca la consulta automáticamente tras una mutación que la invalida", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        requestId: "1",
        operation: "agents.list",
        data: [{ id: "a1" }],
      })
      .mockResolvedValueOnce({
        success: true,
        requestId: "2",
        operation: "agents.create",
        data: { id: "a2" },
      })
      .mockResolvedValueOnce({
        success: true,
        requestId: "3",
        operation: "agents.list",
        data: [{ id: "a1" }, { id: "a2" }],
      });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: vi.fn() },
      configurable: true,
    });

    const { container, unmount } = mount(<AgentsListWithCreate />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="data"]')?.textContent).toBe('[{"id":"a1"}]');

    const button = container.querySelector("button");
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="data"]')?.textContent).toBe(
      '[{"id":"a1"},{"id":"a2"}]'
    );
    unmount();
  });
});
