// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolsScreen } from "../../../../../src/renderer/screens/tools/ToolsScreen.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function setDwm(invoke: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
}

async function settle(times = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

describe("ToolsScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra las herramientas detectadas con su estado real", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "environment.list-tools",
      data: [
        {
          id: "git",
          name: "Git",
          category: "vcs",
          status: "available",
          executablePath: "/usr/bin/git",
        },
        { id: "node", name: "Node.js", category: "runtime", status: "missing" },
      ],
    });
    setDwm(invoke);
    const { container, unmount } = mount(<ToolsScreen />);
    await settle();
    expect(container.textContent).toContain("Git");
    expect(container.textContent).toContain("available");
    expect(container.textContent).toContain("missing");
    unmount();
  });

  it("'Actualizar detección' vuelve a llamar a environment.list-tools con force:true", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "environment.list-tools",
      data: [],
    });
    setDwm(invoke);
    const { container, unmount } = mount(<ToolsScreen />);
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Actualizar detección"
      ) ?? null
    );
    await settle();
    const forcedCall = invoke.mock.calls.find(
      (c) => (c[0] as { payload?: { force?: boolean } }).payload?.force === true
    );
    expect(forcedCall).toBeDefined();
    unmount();
  });

  it("filtra por categoría", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "environment.list-tools",
      data: [
        { id: "git", name: "Git", category: "vcs", status: "available" },
        { id: "node", name: "Node.js", category: "runtime", status: "available" },
      ],
    });
    setDwm(invoke);
    const { container, unmount } = mount(<ToolsScreen />);
    await settle();
    const select = container.querySelector("select") as HTMLSelectElement;
    act(() => {
      select.value = "vcs";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Git");
    expect(container.textContent).not.toContain("Node.js");
    unmount();
  });
});
