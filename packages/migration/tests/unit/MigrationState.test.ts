import { describe, it, expect } from "vitest";
import {
  isMigrationStateTransitionAllowed,
  isTerminalMigrationState,
} from "../../src/MigrationState.js";

describe("isMigrationStateTransitionAllowed", () => {
  it("permite el ciclo de vida normal completo", () => {
    expect(isMigrationStateTransitionAllowed("pending", "preparing")).toBe(true);
    expect(isMigrationStateTransitionAllowed("preparing", "running")).toBe(true);
    expect(isMigrationStateTransitionAllowed("running", "completed")).toBe(true);
    expect(isMigrationStateTransitionAllowed("running", "completed_with_warnings")).toBe(true);
    expect(isMigrationStateTransitionAllowed("running", "cancelled")).toBe(true);
    expect(isMigrationStateTransitionAllowed("running", "rolled_back")).toBe(true);
    expect(isMigrationStateTransitionAllowed("failed", "rolled_back")).toBe(true);
    expect(isMigrationStateTransitionAllowed("cancelled", "rolled_back")).toBe(true);
  });

  it("rechaza transiciones inválidas", () => {
    expect(isMigrationStateTransitionAllowed("pending", "completed")).toBe(false);
    expect(isMigrationStateTransitionAllowed("completed", "running")).toBe(false);
  });
});

describe("isTerminalMigrationState", () => {
  it("identifica los estados terminales", () => {
    expect(isTerminalMigrationState("completed")).toBe(true);
    expect(isTerminalMigrationState("completed_with_warnings")).toBe(true);
    expect(isTerminalMigrationState("cancelled")).toBe(true);
    expect(isTerminalMigrationState("failed")).toBe(true);
    expect(isTerminalMigrationState("rolled_back")).toBe(true);
    expect(isTerminalMigrationState("running")).toBe(false);
  });
});
