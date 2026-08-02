export type { ProfileState } from "./ProfileState.js";
export { isProfileStateTransitionAllowed } from "./ProfileState.js";
export type { ProfileMetadata } from "./ProfileMetadata.js";
export { createInitialProfileMetadata, touchProfileMetadata } from "./ProfileMetadata.js";
export type { ProfileConfiguration } from "./ProfileConfiguration.js";
export {
  defaultProfileConfiguration,
  validateProfileConfiguration,
} from "./ProfileConfiguration.js";
export { Profile } from "./Profile.js";
export { ProfileRegistry } from "./ProfileRegistry.js";
export { ProfileStore, type PersistedProfile } from "./ProfileStore.js";
export { ProfileValidator, type ProfileValidatorOptions } from "./ProfileValidator.js";
export type { ProfileContext } from "./ProfileContext.js";
export { ProfileManager, type ProfileManagerOptions } from "./ProfileManager.js";

export {
  ProfileError,
  createProfileError,
  type ProfileErrorOptions,
  type ProfileErrorOrigin,
} from "./errors/ProfileError.js";
export { ProfileErrorCode } from "./errors/ProfileErrorCode.js";
