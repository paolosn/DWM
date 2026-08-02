import { describe, it, expect } from "vitest";
import { StateManager } from "../src/state/StateManager.js";
import { LifecycleState } from "../src/core/LifecycleState.js";
import { SystemStatus } from "../src/status/SystemStatus.js";

describe("StateManager", () => {
  it("expone un snapshot inicial coherente antes de cualquier transición", () => {
    const manager = new StateManager();
    const snapshot = manager.getSnapshot([], []);
    expect(snapshot.lifecycleState).toBe(LifecycleState.UNINITIALIZED);
    expect(snapshot.configStatus).toBe(SystemStatus.UNCONFIGURED);
    expect(snapshot.profileStatus).toBe(SystemStatus.UNCONFIGURED);
  });

  it("actualiza lifecycleState, configStatus y profileStatus de forma independiente", () => {
    const manager = new StateManager();
    manager.setLifecycleState(LifecycleState.READY);
    manager.setConfigStatus(SystemStatus.OK);
    manager.setProfileStatus(SystemStatus.PENDING);

    const snapshot = manager.getSnapshot([], []);
    expect(snapshot.lifecycleState).toBe(LifecycleState.READY);
    expect(snapshot.configStatus).toBe(SystemStatus.OK);
    expect(snapshot.profileStatus).toBe(SystemStatus.PENDING);
  });

  it("reset() restablece configStatus y profileStatus a UNCONFIGURED", () => {
    const manager = new StateManager();
    manager.setConfigStatus(SystemStatus.OK);
    manager.setProfileStatus(SystemStatus.OK);
    manager.recordStatus("x", SystemStatus.WARNING, "detalle");

    manager.reset();

    const snapshot = manager.getSnapshot([], []);
    expect(snapshot.configStatus).toBe(SystemStatus.UNCONFIGURED);
    expect(snapshot.profileStatus).toBe(SystemStatus.UNCONFIGURED);
  });

  it("recordStatus() acepta un registro sin detalle opcional", () => {
    const manager = new StateManager();
    expect(() => manager.recordStatus("y", SystemStatus.OK)).not.toThrow();
  });
});
