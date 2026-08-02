import { describe, it, expect } from "vitest";
import { validateAIConfiguration } from "../../src/AIConfiguration.js";
import { AIErrorCode } from "../../src/errors/AIErrorCode.js";

const VALID = { timeoutMs: 1000, retry: { maxAttempts: 3, backoff: { baseDelayMs: 100 } } };

describe("validateAIConfiguration", () => {
  it("acepta una configuración válida", () => {
    expect(() => validateAIConfiguration(VALID)).not.toThrow();
    expect(() => validateAIConfiguration({ ...VALID, healthCheckIntervalMs: 5000 })).not.toThrow();
  });

  it("rechaza config ausente", () => {
    expect(() => validateAIConfiguration(null as never)).toThrow(
      expect.objectContaining({ code: AIErrorCode.AI_INVALID_CONFIGURATION })
    );
  });

  it("rechaza timeoutMs <= 0", () => {
    expect(() => validateAIConfiguration({ ...VALID, timeoutMs: 0 })).toThrow(
      expect.objectContaining({ code: AIErrorCode.AI_INVALID_CONFIGURATION })
    );
  });

  it("rechaza retry.maxAttempts < 1 o ausente", () => {
    expect(() =>
      validateAIConfiguration({ ...VALID, retry: { maxAttempts: 0, backoff: { baseDelayMs: 1 } } })
    ).toThrow(expect.objectContaining({ code: AIErrorCode.AI_INVALID_CONFIGURATION }));
    expect(() => validateAIConfiguration({ ...VALID, retry: undefined as never })).toThrow(
      expect.objectContaining({ code: AIErrorCode.AI_INVALID_CONFIGURATION })
    );
  });

  it("rechaza retry.backoff.baseDelayMs ausente", () => {
    expect(() =>
      validateAIConfiguration({ ...VALID, retry: { maxAttempts: 1, backoff: undefined as never } })
    ).toThrow(expect.objectContaining({ code: AIErrorCode.AI_INVALID_CONFIGURATION }));
  });

  it("rechaza healthCheckIntervalMs <= 0 si se indica", () => {
    expect(() => validateAIConfiguration({ ...VALID, healthCheckIntervalMs: 0 })).toThrow(
      expect.objectContaining({ code: AIErrorCode.AI_INVALID_CONFIGURATION })
    );
  });
});
