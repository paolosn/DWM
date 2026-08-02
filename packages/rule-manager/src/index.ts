export type {
  RuleMetadata,
  Rule,
  RuleSummary,
  RuleCreateRequest,
  RuleFilter,
  RuleListOptions,
} from "./RuleTypes.js";
export {
  RULE_FILE_EXTENSION,
  RULE_DWM_FRONTMATTER_KEY,
  isSafeRuleId,
  isRuleContent,
} from "./RuleTypes.js";

export {
  splitFrontmatter,
  joinFrontmatter,
  hasDwmBlock,
  removeDwmBlock,
  serializeDwmBlock,
  upsertDwmBlock,
  parseDwmMetadata,
  extractRuleTitle,
  type SplitFrontmatterResult,
} from "./RuleFrontmatter.js";

export {
  RuleValidator,
  type RuleValidationIssue,
  type RuleValidationResult,
} from "./RuleValidator.js";
export { RuleRepository } from "./RuleRepository.js";
export { RuleRegistry } from "./RuleRegistry.js";
export { RuleManager, type RuleManagerOptions } from "./RuleManager.js";

export {
  RuleError,
  createRuleError,
  type RuleErrorOptions,
  type RuleErrorOrigin,
} from "./errors/RuleError.js";
export { RuleErrorCode } from "./errors/RuleErrorCode.js";
