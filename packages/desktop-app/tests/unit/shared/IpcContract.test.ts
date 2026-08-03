import { describe, expect, it } from "vitest";
import {
  DWM_IPC_CHANNEL,
  DWM_VERSION_CHANNEL,
  DWM_SELECT_IMPORT_FOLDER_CHANNEL,
  DWM_SELECT_IMPORT_ZIP_CHANNEL,
  DWM_OPEN_FOLDER_CHANNEL,
  DWM_IPC_CHANNELS,
  isDesktopInvokeRequest,
} from "../../../src/shared/ipc/IpcContract.js";

describe("IpcContract", () => {
  it("expone nombres de canal estables", () => {
    expect(DWM_IPC_CHANNEL).toBe("dwm:invoke");
    expect(DWM_VERSION_CHANNEL).toBe("dwm:version");
    expect(DWM_SELECT_IMPORT_FOLDER_CHANNEL).toBe("dwm:selectImportFolder");
    expect(DWM_SELECT_IMPORT_ZIP_CHANNEL).toBe("dwm:selectImportZip");
    expect(DWM_OPEN_FOLDER_CHANNEL).toBe("dwm:openFolder");
    expect(DWM_IPC_CHANNELS).toEqual([
      "dwm:invoke",
      "dwm:version",
      "dwm:selectImportFolder",
      "dwm:selectImportZip",
      "dwm:openFolder",
    ]);
  });

  describe("isDesktopInvokeRequest", () => {
    it("acepta una petición mínima válida", () => {
      expect(
        isDesktopInvokeRequest({ requestId: "r1", operation: "workspace.list", payload: {} })
      ).toBe(true);
    });

    it("rechaza valores no objeto", () => {
      expect(isDesktopInvokeRequest(null)).toBe(false);
      expect(isDesktopInvokeRequest(undefined)).toBe(false);
      expect(isDesktopInvokeRequest("nope")).toBe(false);
      expect(isDesktopInvokeRequest(42)).toBe(false);
    });

    it("rechaza objetos sin requestId u operation de tipo string", () => {
      expect(isDesktopInvokeRequest({ operation: "x" })).toBe(false);
      expect(isDesktopInvokeRequest({ requestId: "r1" })).toBe(false);
      expect(isDesktopInvokeRequest({ requestId: 1, operation: "x" })).toBe(false);
      expect(isDesktopInvokeRequest({ requestId: "r1", operation: 2 })).toBe(false);
    });
  });
});
