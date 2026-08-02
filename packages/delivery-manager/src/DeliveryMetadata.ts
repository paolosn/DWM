import type { DeliveryDwmMetadata } from "./DeliveryTypes.js";

/** Crea el bloque `dwm` inicial (no archivado) para una entrega recién importada. */
export function createInitialDeliveryDwmMetadata(): DeliveryDwmMetadata {
  const now = new Date().toISOString();
  return { archived: false, createdAt: now, updatedAt: now };
}

/** Devuelve una copia del bloque `dwm` con `updatedAt` refrescado a ahora. */
export function touchDeliveryDwmMetadata(metadata: DeliveryDwmMetadata): DeliveryDwmMetadata {
  return { ...metadata, updatedAt: new Date().toISOString() };
}

/** Devuelve una copia del bloque `dwm` marcada como archivada (terminal). Idempotente si ya estaba archivado: solo refresca `updatedAt`. */
export function archiveDeliveryDwmMetadata(metadata: DeliveryDwmMetadata): DeliveryDwmMetadata {
  const now = new Date().toISOString();
  return { ...metadata, archived: true, archivedAt: metadata.archivedAt ?? now, updatedAt: now };
}
