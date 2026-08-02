export type {
  EnvironmentPlatform,
  ToolCategory,
  ToolStatus,
  ToolIssueReason,
  ToolVersion,
  ToolResult,
  EnvironmentWarning,
  EnvironmentPlatformInfo,
  EnvironmentCapabilities,
  EnvironmentSummary,
  EnvironmentRequirement,
  RequirementCheckResult,
  EnvironmentValidationResult,
  ToolFilter,
  InspectOptions,
} from "./EnvironmentTypes.js";
export {
  TOOL_CATEGORIES,
  TOOL_STATUSES,
  normalizePlatform,
  isToolCategory,
  isToolStatus,
} from "./EnvironmentTypes.js";

export type { FileSystemProbe } from "./FileSystemProbe.js";
export { NodeFileSystemProbe } from "./FileSystemProbe.js";
export { detectVSCode } from "./VSCodeDetector.js";

export type { SystemInfoProvider } from "./SystemInfoProvider.js";
export { NodeSystemInfoProvider } from "./SystemInfoProvider.js";

export type {
  ProcessRunner,
  ProcessRunResult,
  ProcessRunOptions,
  WhichOptions,
} from "./ProcessRunner.js";
export { NodeProcessRunner } from "./ProcessRunner.js";

export { VersionParser } from "./VersionParser.js";
export { VersionComparator } from "./VersionComparator.js";

export type { AuthorizedEnvironmentVariable } from "./EnvironmentVariables.js";
export {
  AUTHORIZED_ENVIRONMENT_VARIABLES,
  isAuthorizedEnvironmentVariable,
  EnvironmentVariables,
} from "./EnvironmentVariables.js";

export type {
  ToolCommandCandidate,
  ToolDetectorDefinition,
  ToolDetectionContext,
} from "./ToolDetector.js";
export { ToolDetector, isAbortError } from "./ToolDetector.js";
export { BUILTIN_TOOL_DETECTORS } from "./BuiltinToolDetectors.js";
export { ToolRegistry } from "./ToolRegistry.js";
export { EnvironmentDetector } from "./EnvironmentDetector.js";
export { EnvironmentRegistry } from "./EnvironmentRegistry.js";
export { EnvironmentValidator } from "./EnvironmentValidator.js";
export { buildEnvironmentSummary } from "./EnvironmentSummary.js";
export {
  EnvironmentManager,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_BYTES,
  type EnvironmentManagerOptions,
} from "./EnvironmentManager.js";

export {
  EnvironmentError,
  createEnvironmentError,
  type EnvironmentErrorOptions,
  type EnvironmentErrorOrigin,
} from "./errors/EnvironmentError.js";
export { EnvironmentErrorCode } from "./errors/EnvironmentErrorCode.js";
