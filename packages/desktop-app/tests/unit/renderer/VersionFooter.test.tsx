// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { VersionFooter } from "../../../src/renderer/shell/VersionFooter.js";
import { flush, mount } from "../support/renderHelpers.js";

const sampleVersionInfo = {
  appVersion: "1.2.3",
  apiVersion: "1.0.0",
  minCompatibleApiVersion: "1.0.0",
  platform: "linux",
  electron: "31.0.0",
  chrome: "126.0.0",
  node: "22.0.0",
};

describe("VersionFooter", () => {
  it("muestra un estado de carga antes de resolverse la promesa", () => {
    const fetchVersionInfo = vi.fn(() => new Promise<typeof sampleVersionInfo>(() => {}));
    const { container, unmount } = mount(<VersionFooter fetchVersionInfo={fetchVersionInfo} />);
    expect(container.textContent).toContain("Cargando");
    unmount();
  });

  it("muestra la información de versión una vez resuelta", async () => {
    const fetchVersionInfo = vi.fn().mockResolvedValue(sampleVersionInfo);
    const { container, unmount } = mount(<VersionFooter fetchVersionInfo={fetchVersionInfo} />);
    await flush();
    expect(container.textContent).toContain("1.2.3");
    expect(container.textContent).toContain("31.0.0");
    unmount();
  });

  it("muestra un mensaje de error si la promesa se rechaza", async () => {
    const fetchVersionInfo = vi.fn().mockRejectedValue(new Error("sin puente IPC"));
    const { container, unmount } = mount(<VersionFooter fetchVersionInfo={fetchVersionInfo} />);
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("No se pudo obtener");
    unmount();
  });
});
