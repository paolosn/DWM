export { EventPriority, compareEventPriority, isValidEventPriority } from "./EventPriority.js";
export type { EventEnvelope } from "./EventEnvelope.js";
export type { EventOptions, EventDispatchMode } from "./EventOptions.js";
export { PropagationControl } from "./PropagationControl.js";
export type { EventHandler, SubscribeOptions } from "./EventHandler.js";
export type { EventSubscription } from "./EventSubscription.js";
export { EventEmitter, type DispatchFailure, type DispatchResult } from "./EventEmitter.js";
export { EventBus, type EventBusOptions, type PublishResult } from "./EventBus.js";
export { EventBusManager, type EventBusManagerOptions } from "./EventBusManager.js";
export type { EventMiddleware } from "./middleware/Middleware.js";
export { matchesPattern, assertValidPattern } from "./patternMatching.js";

export {
  EventBusError,
  createEventBusError,
  type EventBusErrorOptions,
  type EventBusErrorOrigin,
} from "./errors/EventBusError.js";
export { EventBusErrorCode } from "./errors/EventBusErrorCode.js";
