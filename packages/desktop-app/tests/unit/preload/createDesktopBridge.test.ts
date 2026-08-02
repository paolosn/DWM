import { describe, expect, it, vi } from "vitest";
import { createDesktopBridge } from "../../../src/preload/createDesktopBridge.js";
import {
  DWM_IPC_CHANNEL,
  DWM_VERSION_CHANNEL,
  DWM_SELECT_IMPORT_FOLDER_CHANNEL,
  DWM_SELECT_IMPORT_ZIP_CHANNEL,
} from "../../../src/shared/ipc/IpcContract.js";

describe("createDesktopBridge", () => {
  it("invoke() reenvía la petición por el canal DWM_IPC_CHANNEL", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "r1",
      operation: "workspace.list",
      data: [],
    });
    const bridge = createDesktopBridge(invoke);

    const request = { requestId: "r1", operation: "workspace.list", payload: {} };
    const response = await bridge.invoke(request);

    expect(invoke).toHaveBeenCalledWith(DWM_IPC_CHANNEL, request);
    expect(response).toEqual({
      success: true,
      requestId: "r1",
      operation: "workspace.list",
      data: [],
    });
  });

  it("getVersionInfo() consulta el canal DWM_VERSION_CHANNEL sin argumentos adicionales", async () => {
    const versionInfo = {
      appVersion: "1.0.0",
      apiVersion: "1.0.0",
      minCompatibleApiVersion: "1.0.0",
      platform: "linux",
      electron: "31.0.0",
      chrome: "126.0.0",
      node: "22.0.0",
    };
    const invoke = vi.fn().mockResolvedValue(versionInfo);
    const bridge = createDesktopBridge(invoke);

    const result = await bridge.getVersionInfo();

    expect(invoke).toHaveBeenCalledWith(DWM_VERSION_CHANNEL);
    expect(result).toEqual(versionInfo);
  });

  it("selectImportFolder() invoca DWM_SELECT_IMPORT_FOLDER_CHANNEL sin argumentos", async () => {
    const invoke = vi.fn().mockResolvedValue({ canceled: false, path: "/tmp/proyecto" });
    const bridge = createDesktopBridge(invoke);

    const result = await bridge.selectImportFolder();

    expect(invoke).toHaveBeenCalledWith(DWM_SELECT_IMPORT_FOLDER_CHANNEL);
    expect(result).toEqual({ canceled: false, path: "/tmp/proyecto" });
  });

  it("selectImportZip() invoca DWM_SELECT_IMPORT_ZIP_CHANNEL sin argumentos", async () => {
    const invoke = vi.fn().mockResolvedValue({ canceled: true });
    const bridge = createDesktopBridge(invoke);

    const result = await bridge.selectImportZip();

    expect(invoke).toHaveBeenCalledWith(DWM_SELECT_IMPORT_ZIP_CHANNEL);
    expect(result).toEqual({ canceled: true });
  });
});
