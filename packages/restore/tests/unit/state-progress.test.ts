import { describe, it, expect } from "vitest";
import { isRestoreStateTransitionAllowed, isTerminalRestoreState } from "../../src/RestoreState.js";
import { makeRestoreProgress } from "../../src/RestoreProgress.js";

describe("isRestoreStateTransitionAllowed", () => {
  it("permite el ciclo de vida normal completo", () => {
    expect(isRestoreStateTransitionAllowed("pending", "preparing")).toBe(true);
    expect(isRestoreStateTransitionAllowed("preparing", "restoring")).toBe(true);
    expect(isRestoreStateTransitionAllowed("restoring", "verifying")).toBe(true);
    expect(isRestoreStateTransitionAllowed("verifying", "completed")).toBe(true);
    expect(isRestoreStateTransitionAllowed("verifying", "completed_with_warnings")).toBe(true);
    expect(isRestoreStateTransitionAllowed("failed", "rolled_back")).toBe(true);
    expect(isRestoreStateTransitionAllowed("cancelled", "rolled_back")).toBe(true);
  });

  it("rechaza transiciones inválidas", () => {
    expect(isRestoreStateTransitionAllowed("pending", "completed")).toBe(false);
    expect(isRestoreStateTransitionAllowed("completed", "restoring")).toBe(false);
  });
});

describe("isTerminalRestoreState", () => {
  it("identifica los estados terminales", () => {
    expect(isTerminalRestoreState("completed")).toBe(true);
    expect(isTerminalRestoreState("completed_with_warnings")).toBe(true);
    expect(isTerminalRestoreState("cancelled")).toBe(true);
    expect(isTerminalRestoreState("failed")).toBe(true);
    expect(isTerminalRestoreState("rolled_back")).toBe(true);
    expect(isTerminalRestoreState("restoring")).toBe(false);
  });
});

describe("makeRestoreProgress", () => {
  it("calcula el porcentaje cuando hay total de elementos", () => {
    const progress = makeRestoreProgress("restoring", 1, { itemsTotal: 4, currentResource: "x" });
    expect(progress.percentage).toBe(25);
    expect(progress.currentResource).toBe("x");
  });

  it("omite el porcentaje si no hay total de elementos", () => {
    expect(makeRestoreProgress("restoring", 1).percentage).toBeUndefined();
  });
});
