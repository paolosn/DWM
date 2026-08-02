import type { VerificationCategory } from "./VerificationCategory.js";

export interface VerificationRequest {
  /** Si se omite, se ejecuta la verificación completa (todas las categorías). */
  readonly categories?: readonly VerificationCategory[];
  /** Si es `true`, se omiten las comprobaciones que requieren E/S costosa (p. ej. integridad de backups). */
  readonly dryRun?: boolean;
}
