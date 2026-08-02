// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/renderer/App.js";
import { flush, mount } from "../support/renderHelpers.js";
import type { DesktopBridge } from "../../../src/shared/ipc/IpcContract.js";

describe("App", () => {
  beforeEach(() => {
    const bridge: DesktopBridge = {
      invoke: vi.fn(),
      getVersionInfo: vi.fn().mockResolvedValue({
        appVersion: "0.1.0",
        apiVersion: "1.0.0",
        minCompatibleApiVersion: "1.0.0",
        platform: "linux",
        electron: "31.0.0",
        chrome: "126.0.0",
        node: "22.0.0",
      }),
      selectImportFolder: vi.fn().mockResolvedValue({ canceled: true }),
      selectImportZip: vi.fn().mockResolvedValue({ canceled: true }),
    };
    Object.defineProperty(window, "dwm", { value: bridge, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "dwm");
  });

  it("monta el AppShell dentro del ErrorBoundary usando el puente window.dwm por defecto", async () => {
    const { container, unmount } = mount(<App />);
    expect(container.querySelector('[data-testid="app-shell"]')).not.toBeNull();
    await flush();
    expect(container.querySelector('[data-testid="version-footer"]')?.textContent).toContain(
      "0.1.0"
    );
    unmount();
  });
});
