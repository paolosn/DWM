export type { AIRequest } from "./AIRequest.js";
export type { AIResponse } from "./AIResponse.js";
export type { AIConnection, ConnectionStatus } from "./AIConnection.js";
export { initialConnection, withStatus } from "./AIConnection.js";
export type { AIConfiguration, AIRetryConfiguration } from "./AIConfiguration.js";
export { validateAIConfiguration } from "./AIConfiguration.js";
export type { AIProvider } from "./AIProvider.js";
export type { AIProviderFactory } from "./AIProviderFactory.js";
export { AIProviderRegistry, type RegisteredProvider } from "./AIProviderRegistry.js";
export { AIHealthMonitor, type AIHealthMonitorOptions } from "./AIHealthMonitor.js";
export { AIManager, type AIManagerOptions, type RegisterProviderOptions } from "./AIManager.js";

export {
  AIError,
  createAIError,
  type AIErrorOptions,
  type AIErrorOrigin,
} from "./errors/AIError.js";
export { AIErrorCode } from "./errors/AIErrorCode.js";
