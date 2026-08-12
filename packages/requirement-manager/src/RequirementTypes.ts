export const REQUIREMENT_STATUSES = [
  "pending",
  "accepted",
  "linked",
  "in_progress",
  "completed",
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const REQUIREMENT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];

/** Recursos recomendados por el análisis, o realmente aplicados tras la sincronización — nunca inventados, solo lo que el usuario confirmó o el análisis realmente devolvió. */
export interface RequirementResourceSet {
  readonly agents?: readonly string[];
  readonly skills?: readonly string[];
  readonly rules?: readonly string[];
  readonly ai?: string;
  readonly mcp?: readonly string[];
}

export interface Requirement {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly type: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** El análisis original completo (Viabilidad/Auditoría/Seguridad), tal cual se generó — nunca reescrito. */
  readonly analysis?: unknown;
  readonly status: RequirementStatus;
  readonly priority?: RequirementPriority;
  readonly clientId: string;
  readonly profileId?: string;
  readonly projectId?: string;
  readonly briefing?: string;
  readonly recommendedResources?: RequirementResourceSet;
  readonly appliedResources?: RequirementResourceSet;
  readonly notes?: string;
}

export interface RequirementCreateRequest {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly type: string;
  readonly clientId: string;
  readonly analysis?: unknown;
  readonly priority?: RequirementPriority;
  readonly profileId?: string;
  readonly projectId?: string;
  readonly briefing?: string;
  readonly recommendedResources?: RequirementResourceSet;
  readonly notes?: string;
}

export interface RequirementUpdateRequest {
  readonly title?: string;
  readonly description?: string;
  readonly status?: RequirementStatus;
  readonly priority?: RequirementPriority;
  readonly profileId?: string;
  readonly projectId?: string;
  readonly briefing?: string;
  readonly recommendedResources?: RequirementResourceSet;
  readonly appliedResources?: RequirementResourceSet;
  readonly notes?: string;
}
