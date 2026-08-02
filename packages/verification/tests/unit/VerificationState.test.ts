import { describe, it, expect } from "vitest";
import {
  isVerificationStateTransitionAllowed,
  isTerminalVerificationState,
} from "../../src/VerificationState.js";
import {
  isValidVerificationCategory,
  ALL_VERIFICATION_CATEGORIES,
} from "../../src/VerificationCategory.js";

describe("isVerificationStateTransitionAllowed", () => {
  it("permite el ciclo de vida normal completo", () => {
    expect(isVerificationStateTransitionAllowed("pending", "running")).toBe(true);
    expect(isVerificationStateTransitionAllowed("running", "completed")).toBe(true);
    expect(isVerificationStateTransitionAllowed("running", "completed_with_warnings")).toBe(true);
    expect(isVerificationStateTransitionAllowed("running", "failed")).toBe(true);
    expect(isVerificationStateTransitionAllowed("pending", "failed")).toBe(true);
  });

  it("rechaza transiciones inválidas", () => {
    expect(isVerificationStateTransitionAllowed("pending", "completed")).toBe(false);
    expect(isVerificationStateTransitionAllowed("completed", "running")).toBe(false);
  });
});

describe("isTerminalVerificationState", () => {
  it("identifica los estados terminales", () => {
    expect(isTerminalVerificationState("completed")).toBe(true);
    expect(isTerminalVerificationState("completed_with_warnings")).toBe(true);
    expect(isTerminalVerificationState("failed")).toBe(true);
    expect(isTerminalVerificationState("running")).toBe(false);
    expect(isTerminalVerificationState("pending")).toBe(false);
  });
});

describe("isValidVerificationCategory", () => {
  it("acepta únicamente el catálogo cerrado", () => {
    for (const category of ALL_VERIFICATION_CATEGORIES) {
      expect(isValidVerificationCategory(category)).toBe(true);
    }
    expect(isValidVerificationCategory("no-existe")).toBe(false);
    expect(isValidVerificationCategory(42)).toBe(false);
  });
});
