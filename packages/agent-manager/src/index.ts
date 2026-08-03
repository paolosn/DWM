export type {
  AgentMetadata,
  Agent,
  AgentSummary,
  AgentCreateRequest,
  AgentFilter,
  AgentListOptions,
} from "./AgentTypes.js";
export {
  AGENT_FILE_EXTENSION,
  AGENT_DWM_FRONTMATTER_KEY,
  isSafeAgentId,
  isAgentContent,
} from "./AgentTypes.js";

export {
  splitFrontmatter,
  joinFrontmatter,
  hasDwmBlock,
  removeDwmBlock,
  serializeDwmBlock,
  upsertDwmBlock,
  parseDwmMetadata,
  extractAgentDisplayFields,
  type SplitFrontmatterResult,
} from "./AgentFrontmatter.js";

export {
  AgentValidator,
  type AgentValidationIssue,
  type AgentValidationResult,
} from "./AgentValidator.js";
export { AgentRepository } from "./AgentRepository.js";
export { AgentRegistry } from "./AgentRegistry.js";
export { AgentManager, type AgentManagerOptions } from "./AgentManager.js";

export {
  AgentError,
  createAgentError,
  type AgentErrorOptions,
  type AgentErrorOrigin,
} from "./errors/AgentError.js";
export { AgentErrorCode } from "./errors/AgentErrorCode.js";
