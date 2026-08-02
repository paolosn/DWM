// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutScreen } from "../../../../../src/renderer/screens/about/AboutScreen.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

async function settle(times = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

describe("AboutScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra la información de versión real y marca lo no disponible explícitamente", async () => {
    const getVersionInfo = vi.fn().mockResolvedValue({
      appVersion: "0.1.0",
      apiVersion: "1.2.0",
      minCompatibleApiVersion: "1.0.0",
      platform: "linux",
      electron: "31.0.0",
      chrome: "126.0.0",
      node: "22.0.0",
    });
    Object.defineProperty(window, "dwm", {
      value: {
        invoke: vi.fn().mockResolvedValue({
          success: true,
          requestId: "x",
          operation: "workspace.get",
          data: undefined,
        }),
        getVersionInfo,
      },
      configurable: true,
    });
    const { container, unmount } = mount(<AboutScreen />);
    await settle();
    expect(container.textContent).toContain("0.1.0");
    expect(container.textContent).toContain("1.2.0");
    expect(container.textContent).toContain("No disponible");
    unmount();
  });

  it("'Copiar diagnóstico' copia un JSON con todos los campos reales al portapapeles", async () => {
    const getVersionInfo = vi.fn().mockResolvedValue({
      appVersion: "0.1.0",
      apiVersion: "1.2.0",
      minCompatibleApiVersion: "1.0.0",
      platform: "linux",
      electron: "31.0.0",
      chrome: "126.0.0",
      node: "22.0.0",
    });
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "workspace.get",
      data: { root: "/x/ws", metadata: { id: "ws1" }, registeredAt: "2026-01-01T00:00:00.000Z" },
    });
    Object.defineProperty(window, "dwm", { value: { invoke, getVersionInfo }, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const { container, unmount } = mount(<AboutScreen />);
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Copiar diagnóstico"
      ) ?? null
    );
    await settle();

    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writeText.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(payload.appVersion).toBe("0.1.0");
    expect(payload.activeWorkspace).toBe("/x/ws");
    expect(container.textContent).toContain("Diagnóstico copiado");
    unmount();
  });
});
