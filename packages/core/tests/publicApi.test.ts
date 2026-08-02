import { describe, it, expect } from "vitest";
import {
  DWMCore,
  LifecycleState,
  SystemStatus,
  ErrorCode,
  DWMError,
  FileSystemStorageProvider,
  MODULE_CONTRACT_VERSION,
  ADAPTER_CONTRACT_VERSION,
  isValidSemver,
  isContractCompatible,
} from "../src/index.js";
import { MemoryStorageProvider } from "./support/doubles.js";

describe("Punto de entrada público (@dwm/core)", () => {
  it("expone la superficie pública documentada y funciona end-to-end", async () => {
    expect(typeof DWMCore).toBe("function");
    expect(typeof FileSystemStorageProvider).toBe("function");
    expect(MODULE_CONTRACT_VERSION).toBe("1.0.0");
    expect(ADAPTER_CONTRACT_VERSION).toBe("1.0.0");
    expect(isValidSemver("1.0.0")).toBe(true);
    expect(isContractCompatible("1.0.0", "1.2.0")).toBe(true);

    const core = new DWMCore();
    expect(core.getLifecycleState()).toBe(LifecycleState.UNINITIALIZED);

    await core.initialize({ storage: new MemoryStorageProvider() });
    expect(core.getLifecycleState()).toBe(LifecycleState.READY);

    await core.registerModule({
      id: "public-api.module",
      version: "1.0.0",
      contractVersion: "1.0.0",
      init: async (context) => context.reportStatus(SystemStatus.OK),
    });
    expect(core.listModules()[0]!.status).toBe(SystemStatus.OK);

    try {
      await core.registerModule({
        id: "public-api.module",
        version: "1.0.0",
        contractVersion: "1.0.0",
        init: async () => {},
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DWMError);
      expect((err as DWMError).code).toBe(ErrorCode.MODULE_ID_DUPLICATED);
    }

    const report = await core.shutdown();
    expect(report.failures).toHaveLength(0);
    expect(core.getLifecycleState()).toBe(LifecycleState.STOPPED);
  });
});
