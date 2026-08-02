/**
 * Descriptor mínimo de un perfil, tal como lo necesita el Core para saber
 * "cuál está activo" (README §1). La creación, cambio, exportación e
 * importación completas de perfiles (FRS-001 §7) corresponden al futuro
 * Profile Manager, no al Core.
 */
export interface ProfileDescriptor {
  id: string;
  name: string;
  createdAt: string; // ISO-8601
}
