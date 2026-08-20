/**
 * Categorías reales de proyecto observadas en PSN-PANEL/SISTEMA-DE-TRABAJO
 * (carpetas `PROYECTOS/VIABILIDAD`, `PROYECTOS/AUDITORIAS`,
 * `PROYECTOS/SEGURIDAD`) más "directo" para el flujo de nuevo proyecto
 * sin pasar por viabilidad/auditoría/seguridad — mismo nivel que las
 * demás, bajo `PROYECTOS/`.
 */
export const PROJECT_PROVISIONING_CATEGORIES = [
  "viabilidad",
  "auditoria",
  "seguridad",
  "directo",
] as const;
export type ProjectProvisioningCategory = (typeof PROJECT_PROVISIONING_CATEGORIES)[number];

const CATEGORY_FOLDER: Readonly<Record<ProjectProvisioningCategory, string>> = {
  viabilidad: "VIABILIDAD",
  auditoria: "AUDITORIAS",
  seguridad: "SEGURIDAD",
  directo: "DIRECTOS",
};

export function categoryFolderName(category: ProjectProvisioningCategory): string {
  return CATEGORY_FOLDER[category];
}

/** Datos humanos del cliente, tal y como los recoge cada formulario (todos opcionales salvo el nombre). */
export interface ClientIntakeData {
  readonly name: string;
  readonly empresa?: string;
  readonly email?: string;
  readonly telefono?: string;
  readonly notas?: string;
}

/** Datos humanos del proyecto en sí, comunes a las cuatro entradas. */
export interface ProjectIntakeData {
  readonly name: string;
  readonly description?: string;
  readonly tipoTrabajo?: string;
  readonly precioOModalidad?: string;
  readonly plazo?: string;
  readonly notas?: string;
  readonly origen?: string;
}

/** Contenido opcional de un análisis de viabilidad ya aceptado, usado para generar `briefing-inicial.md` (mismas secciones que PSN-PANEL). */
export interface ViabilityBriefingInput {
  readonly veredicto?: string;
  readonly explicacionVeredicto?: string;
  readonly precioMercado?: string;
  readonly precioMinimoRecomendado?: string;
  readonly presupuestoCliente?: string;
  readonly notasNegociacion?: string;
  readonly equipoNecesario?: readonly string[];
  readonly riesgos?: readonly string[];
  readonly preguntasAlCliente?: readonly string[];
  readonly serviciosExternos?: readonly string[];
  readonly siguientePaso?: string;
}

export interface ProvisionProjectRequest {
  readonly category: ProjectProvisioningCategory;
  /** Id de un cliente ya existente a reutilizar; si se omite, se crea uno nuevo a partir de `client`. */
  readonly existingClientId?: string;
  readonly client?: ClientIntakeData;
  readonly project: ProjectIntakeData;
  readonly briefing?: ViabilityBriefingInput;
  /** Perfil elegido explícitamente por el usuario; opcional -- si se omite, el proyecto se crea sin perfil (estado válido, nunca bloquea la creación). */
  readonly profileId?: string;
}

export interface ProvisionProjectResult {
  readonly projectId: string;
  readonly clientId: string;
  readonly clientCreated: boolean;
  readonly projectPath: string;
  readonly briefingGenerated: boolean;
}
