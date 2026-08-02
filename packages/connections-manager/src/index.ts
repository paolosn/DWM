export {
  CONNECTION_TYPES,
  CONNECTORS_WITH_REAL_ADAPTER,
  CONNECTION_STATUSES,
  CONNECTION_PROFILE_STATUSES,
  MCP_TRANSPORTS,
  isConnectionType,
  isConnectionStatus,
  isSafeName,
  isSafeId,
  type ConnectionType,
  type ConnectionStatus,
  type SafeConnectionError,
  type SafeConnectionConfig,
  type SecretReferences,
  type Connection,
  type CreateConnectionRequest,
  type UpdateConnectionRequest,
  type ConnectionProfile,
  type ConnectionProfileStatus,
  type ConnectionGrant,
  type McpTransport,
  type McpDiscoveredTool,
  type McpDiscoveredResource,
  type McpDiscoveredPrompt,
  type McpServerDefinition,
  type ConnectionTestResult,
} from "./ConnectionTypes.js";

export { redactSecretValues, toSafeError, maskedSecretPreview } from "./ConnectionSecrets.js";

export { ConnectionValidator } from "./ConnectionValidator.js";
export { ConnectionRepository } from "./ConnectionRepository.js";
export { ConnectionRegistry } from "./ConnectionRegistry.js";
export { ConnectionCapabilityManager } from "./ConnectionCapabilityManager.js";
export { ConnectionProfileManager } from "./ConnectionProfileManager.js";
export {
  ConnectionAdapterRegistry,
  type ConnectionAdapterRegistryOptions,
} from "./ConnectionAdapterRegistry.js";
export { ConnectionTester, type ConnectionTestOptions } from "./ConnectionTester.js";
export { ConnectionsManager, type ConnectionsManagerOptions } from "./ConnectionsManager.js";

export type {
  ConnectionAdapter,
  ConnectionTestInput,
  McpDiscoveryResult,
} from "./adapters/ConnectionAdapter.js";
export { McpStdioConnectionAdapter } from "./adapters/McpStdioConnectionAdapter.js";
export { McpStdioSession, type McpStdioProcessOptions } from "./adapters/McpStdioSession.js";
export { McpProcessSupervisor } from "./adapters/McpProcessSupervisor.js";
export {
  McpRemoteConnectionAdapter,
  type FetchLike,
} from "./adapters/McpRemoteConnectionAdapter.js";
export { WordPressConnectionAdapter } from "./adapters/WordPressConnectionAdapter.js";
export { HttpConnectionAdapter } from "./adapters/HttpConnectionAdapter.js";
export { GitHubConnectionAdapter } from "./adapters/GitHubConnectionAdapter.js";
export {
  SSHConnectionAdapter,
  type SSHClientPort,
  type SSHTestOptions,
  type SSHTestOutcome,
} from "./adapters/SSHConnectionAdapter.js";

export {
  ConnectionError,
  createConnectionError,
  type ConnectionErrorOptions,
  type ConnectionErrorOrigin,
} from "./errors/ConnectionError.js";
export { ConnectionErrorCode } from "./errors/ConnectionErrorCode.js";
