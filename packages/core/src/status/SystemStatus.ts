/**
 * Catálogo cerrado de estados del sistema, tal como define FRS-001 §15.
 *
 * Todo elemento gestionado por DWM (herramienta, adaptador, proveedor de IA,
 * credencial, backup, perfil, proyecto, o cualquier módulo del propio Core)
 * debe representarse siempre con uno de estos valores. No se admiten estados
 * adicionales no documentados: ampliar este catálogo requiere una revisión
 * formal de FRS-001, no una extensión ad-hoc en el código.
 */
export enum SystemStatus {
  /** El elemento funciona según lo esperado, sin ninguna acción pendiente. */
  OK = "OK",

  /** El elemento funciona pero requiere atención. */
  WARNING = "WARNING",

  /** El elemento no funciona según lo esperado y requiere intervención. */
  ERROR = "ERROR",

  /** El elemento está en proceso de instalación, actualización, restauración o migración. */
  UPDATING = "UPDATING",

  /** El elemento ha sido reconocido pero aún no se ha completado su configuración. */
  PENDING = "PENDING",

  /** El elemento no ha sido configurado en absoluto. */
  UNCONFIGURED = "UNCONFIGURED",

  /** El elemento existe y está correctamente configurado, pero ha sido desactivado deliberadamente. */
  DISABLED = "DISABLED",

  /** El elemento no es compatible con la versión actual del núcleo. */
  INCOMPATIBLE = "INCOMPATIBLE",
}

/**
 * Registro de estado de un componente concreto (módulo, adaptador, o subsistema
 * interno del Core) tal y como lo mantiene el StateManager.
 */
export interface StatusRecord {
  sourceId: string;
  status: SystemStatus;
  detail?: string;
  updatedAt: string; // ISO-8601
}
