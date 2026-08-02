export type { SecretEntry } from "./SecretEntry.js";
export { createInitialEntry, withUpdatedCipherText, withRotatedCipherText } from "./SecretEntry.js";
export type { SecretConfiguration } from "./SecretConfiguration.js";
export { validateSecretConfiguration } from "./SecretConfiguration.js";
export type { SecretProvider } from "./SecretProvider.js";
export { DefaultSecretProvider } from "./DefaultSecretProvider.js";
export { SecretStore } from "./SecretStore.js";
export {
  SecretsManager,
  type SecretsManagerOptions,
  type SecretMetadataView,
  type ImportResult,
} from "./SecretsManager.js";
export { assertValidKey, assertValidValue } from "./key.js";

export {
  SecretError,
  createSecretError,
  type SecretErrorOptions,
  type SecretErrorOrigin,
} from "./errors/SecretError.js";
export { SecretErrorCode } from "./errors/SecretErrorCode.js";
