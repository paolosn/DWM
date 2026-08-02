// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackagesScreen } from "../../../../../src/renderer/screens/packages/PackagesScreen.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function setDwm(invoke: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
}

function setValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function settle(times = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

describe("PackagesScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("crea un paquete con packages.create real", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "packages.create",
      data: {
        manifest: {
          packageId: "pkg-1",
          formatVersion: "1.0",
          createdAt: "x",
          dwmVersion: "1",
          sourcePlatform: "linux",
          entries: [],
          totalFiles: 0,
        },
        zipPath: "/x/pkg.zip",
        warnings: [],
      },
    });
    setDwm(invoke);
    const { container, unmount } = mount(<PackagesScreen />);
    const input = container.querySelector("input") as HTMLInputElement;
    setValue(input, "/x/pkg.zip");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear paquete"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("pkg-1");
    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "packages.create"
    );
    expect(
      (call?.[0] as { payload: { destinationZipPath: string } }).payload.destinationZipPath
    ).toBe("/x/pkg.zip");
    unmount();
  });

  it("inspecciona un paquete combinando inspect + list-contents + validate reales", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "packages.inspect") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "packages.inspect",
          data: {
            packageId: "pkg-1",
            formatVersion: "1.0",
            createdAt: "x",
            dwmVersion: "1",
            sourcePlatform: "linux",
            entries: [],
            totalFiles: 3,
          },
        });
      }
      if (request.operation === "packages.list-contents") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "packages.list-contents",
          data: [
            { relativePath: "a.txt", isDirectory: false, compressedSize: 1, uncompressedSize: 1 },
          ],
        });
      }
      if (request.operation === "packages.validate") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "packages.validate",
          data: { valid: true, issues: [] },
        });
      }
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(<PackagesScreen />);
    const inputs = container.querySelectorAll("input");
    setValue(inputs[2] as HTMLInputElement, "/x/pkg.zip");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Inspeccionar"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("a.txt");
    expect(container.textContent).toContain("Válido");
    unmount();
  });
});
