import type { BackoffOptions } from "@dwm/scheduler";
import { AIErrorCode } from "./errors/AIErrorCode.js";
import { createAIError } from "./errors/AIError.js";

export interface AIRetryConfiguration {
  readonly maxAttempts: number;
  readonly backoff: BackoffOptions;
}

export interface AIConfiguration {
  readonly timeoutMs: number;
  readonly retry: AIRetryConfiguration;
  /** Si se indica y hay un Scheduler inyectado, se programa un health check periódico. */
  readonly healthCheckIntervalMs?: number;
}

export function validateAIConfiguration(config: AIConfiguration): void {
  if (!config || typeof config !== "object") {
    throw createAIError({
      code: AIErrorCode.AI_INVALID_CONFIGURATION,
      message: "AIConfiguration es obligatoria y debe ser un objeto.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.timeoutMs !== "number" || config.timeoutMs <= 0) {
    throw createAIError({
      code: AIErrorCode.AI_INVALID_CONFIGURATION,
      message: "AIConfiguration.timeoutMs debe ser un número > 0.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (
    !config.retry ||
    typeof config.retry.maxAttempts !== "number" ||
    config.retry.maxAttempts < 1
  ) {
    throw createAIError({
      code: AIErrorCode.AI_INVALID_CONFIGURATION,
      message: "AIConfiguration.retry.maxAttempts debe ser un número >= 1.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (!config.retry.backoff || typeof config.retry.backoff.baseDelayMs !== "number") {
    throw createAIError({
      code: AIErrorCode.AI_INVALID_CONFIGURATION,
      message: "AIConfiguration.retry.backoff.baseDelayMs es obligatorio.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (config.healthCheckIntervalMs !== undefined && config.healthCheckIntervalMs <= 0) {
    throw createAIError({
      code: AIErrorCode.AI_INVALID_CONFIGURATION,
      message: "AIConfiguration.healthCheckIntervalMs debe ser un número > 0 si se indica.",
      origin: "configuration",
      recoverable: false,
    });
  }
}
