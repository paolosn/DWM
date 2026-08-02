// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProjectsWithDetails } from "../../../../../src/renderer/screens/projects/useProjectsWithDetails.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function setDwm(overrides: Record<string, unknown> = {}): void {
  const invoke = vi
    .fn()
    .mockImplementation((request: { operation: string; payload?: { id?: string } }) => {
      const key =
        request.operation === "projects.get"
          ? `projects.get:${request.payload?.id}`
          : request.operation;
      if (key in overrides) return Promise.resolve(overrides[key]);
      return Promise.reject(new Error(`no mockeada: ${key}`));
    });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
}

async function settle(times = 4): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) {
      await Promise.resolve();
    }
  });
}

function Probe(): JSX.Element {
  const { status, projects, error } = useProjectsWithDetails();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="count">{projects.length}</span>
      <span data-testid="error">{error?.message ?? ""}</span>
    </div>
  );
}

describe("useProjectsWithDetails", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("combina projects.list con un projects.get por cada id", async () => {
    setDwm({
      "projects.list": {
        success: true,
        requestId: "x",
        operation: "projects.list",
        data: ["p1", "p2"],
      },
      "projects.get:p1": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: { id: "p1" },
      },
      "projects.get:p2": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: { id: "p2" },
      },
    });
    const { container, unmount } = mount(<Probe />);
    await settle();
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("success");
    expect(container.querySelector('[data-testid="count"]')?.textContent).toBe("2");
    unmount();
  });

  it("no llama a projects.get cuando la lista está vacía", async () => {
    setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: [] },
    });
    const { container, unmount } = mount(<Probe />);
    await settle();
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("success");
    expect(container.querySelector('[data-testid="count"]')?.textContent).toBe("0");
    unmount();
  });

  it("expone error cuando projects.list falla", async () => {
    setDwm({
      "projects.list": {
        success: false,
        requestId: "x",
        operation: "projects.list",
        error: { code: "E", message: "fallo listado", category: "unknown", retryable: true },
      },
    });
    const { container, unmount } = mount(<Probe />);
    await settle();
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("error");
    expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("fallo listado");
    unmount();
  });

  it("expone error cuando algún projects.get falla", async () => {
    setDwm({
      "projects.list": { success: true, requestId: "x", operation: "projects.list", data: ["p1"] },
      "projects.get:p1": {
        success: false,
        requestId: "x",
        operation: "projects.get",
        error: { code: "E", message: "fallo detalle", category: "unknown", retryable: true },
      },
    });
    const { container, unmount } = mount(<Probe />);
    await settle();
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("error");
    unmount();
  });
});
