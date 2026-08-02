export enum HostLifecycleState {
  CREATED = "CREATED",
  VALIDATING_COMPOSITION = "VALIDATING_COMPOSITION",
  INITIALIZING_CORE = "INITIALIZING_CORE",
  BUILDING_COMPONENTS = "BUILDING_COMPONENTS",
  REGISTERING_COMPONENTS = "REGISTERING_COMPONENTS",
  READY = "READY",
  RUNNING = "RUNNING",
  SHUTTING_DOWN = "SHUTTING_DOWN",
  STOPPED = "STOPPED",
  ERROR = "ERROR",
}

/** Estados en los que una composición está en curso (TDS-001 §7.3-§7.4). */
export const COMPOSING_STATES: ReadonlySet<HostLifecycleState> = new Set([
  HostLifecycleState.VALIDATING_COMPOSITION,
  HostLifecycleState.INITIALIZING_CORE,
  HostLifecycleState.BUILDING_COMPONENTS,
  HostLifecycleState.REGISTERING_COMPONENTS,
]);

const ALLOWED_TRANSITIONS: Record<HostLifecycleState, ReadonlySet<HostLifecycleState>> = {
  [HostLifecycleState.CREATED]: new Set([
    HostLifecycleState.VALIDATING_COMPOSITION,
    HostLifecycleState.ERROR,
  ]),
  [HostLifecycleState.VALIDATING_COMPOSITION]: new Set([
    HostLifecycleState.INITIALIZING_CORE,
    HostLifecycleState.STOPPED,
    HostLifecycleState.ERROR,
  ]),
  [HostLifecycleState.INITIALIZING_CORE]: new Set([
    HostLifecycleState.BUILDING_COMPONENTS,
    HostLifecycleState.STOPPED,
    HostLifecycleState.ERROR,
  ]),
  [HostLifecycleState.BUILDING_COMPONENTS]: new Set([
    HostLifecycleState.REGISTERING_COMPONENTS,
    HostLifecycleState.STOPPED,
    HostLifecycleState.ERROR,
  ]),
  [HostLifecycleState.REGISTERING_COMPONENTS]: new Set([
    HostLifecycleState.READY,
    HostLifecycleState.STOPPED,
    HostLifecycleState.ERROR,
  ]),
  [HostLifecycleState.READY]: new Set([
    HostLifecycleState.RUNNING,
    HostLifecycleState.SHUTTING_DOWN,
    HostLifecycleState.ERROR,
  ]),
  [HostLifecycleState.RUNNING]: new Set([
    HostLifecycleState.SHUTTING_DOWN,
    HostLifecycleState.ERROR,
  ]),
  [HostLifecycleState.SHUTTING_DOWN]: new Set([
    HostLifecycleState.STOPPED,
    HostLifecycleState.ERROR,
  ]),
  [HostLifecycleState.STOPPED]: new Set([]),
  [HostLifecycleState.ERROR]: new Set([]),
};

export function isHostTransitionAllowed(from: HostLifecycleState, to: HostLifecycleState): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}
