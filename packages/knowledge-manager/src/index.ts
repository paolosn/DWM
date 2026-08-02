export type {
  KnowledgeMetadata,
  KnowledgeItem,
  KnowledgeSummary,
  KnowledgeCreateRequest,
  KnowledgeMetadataUpdate,
  KnowledgeFilter,
  KnowledgeListOptions,
  KnowledgeDeleteOptions,
  KnowledgeNode,
  KnowledgeDuplicateGroup,
  KnowledgeExtension,
} from "./KnowledgeTypes.js";
export {
  KNOWLEDGE_ALLOWED_EXTENSIONS,
  KNOWLEDGE_DWM_FRONTMATTER_KEY,
  KNOWLEDGE_MAX_PATH_DEPTH,
  isSafeKnowledgeId,
  hasKnowledgeExtension,
  isKnowledgeContent,
  isSafeKnowledgeTag,
  isSafeKnowledgeCategory,
  normalizeTags,
  toKnowledgeId,
  knowledgeBaseName,
} from "./KnowledgeTypes.js";

export {
  splitFrontmatter,
  joinFrontmatter,
  hasDwmBlock,
  removeDwmBlock,
  serializeDwmBlock,
  upsertDwmBlock,
  parseDwmMetadata,
  extractKnowledgeTitle,
  type SplitFrontmatterResult,
} from "./KnowledgeFrontmatter.js";

export { KnowledgeMetadataService } from "./KnowledgeMetadata.js";
export {
  KnowledgeValidator,
  type KnowledgeValidationIssue,
  type KnowledgeValidationResult,
} from "./KnowledgeValidator.js";
export { KnowledgeRelations, type KnowledgeRelationView } from "./KnowledgeRelations.js";
export { KnowledgeRepository } from "./KnowledgeRepository.js";
export { KnowledgeRegistry } from "./KnowledgeRegistry.js";
export { KnowledgeManager, type KnowledgeManagerOptions } from "./KnowledgeManager.js";

export {
  KnowledgeError,
  createKnowledgeError,
  type KnowledgeErrorOptions,
  type KnowledgeErrorOrigin,
} from "./errors/KnowledgeError.js";
export { KnowledgeErrorCode } from "./errors/KnowledgeErrorCode.js";
