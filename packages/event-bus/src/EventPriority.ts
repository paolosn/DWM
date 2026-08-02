/** Prioridad de un evento publicado, de menor a mayor severidad. */
export enum EventPriority {
  LOW = "low",
  NORMAL = "normal",
  HIGH = "high",
  CRITICAL = "critical",
}

const RANK: Record<EventPriority, number> = {
  [EventPriority.LOW]: 0,
  [EventPriority.NORMAL]: 1,
  [EventPriority.HIGH]: 2,
  [EventPriority.CRITICAL]: 3,
};

export function compareEventPriority(a: EventPriority, b: EventPriority): number {
  return RANK[a] - RANK[b];
}

export function isValidEventPriority(value: unknown): value is EventPriority {
  return typeof value === "string" && Object.values(EventPriority).includes(value as EventPriority);
}
