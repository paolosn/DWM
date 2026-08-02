export interface BackoffOptions {
  /** Retardo base, en milisegundos, antes del primer reintento. */
  readonly baseDelayMs: number;
  /** Factor multiplicativo aplicado en cada reintento sucesivo. Por defecto: 2. */
  readonly factor?: number;
  /** Retardo máximo, en milisegundos. Por defecto: sin límite explícito (Number.MAX_SAFE_INTEGER). */
  readonly maxDelayMs?: number;
}

/** Retardo exponencial para el intento número `attempt` (1 = primer reintento). */
export function computeBackoffDelay(options: BackoffOptions, attempt: number): number {
  const factor = options.factor ?? 2;
  const maxDelayMs = options.maxDelayMs ?? Number.MAX_SAFE_INTEGER;
  const delay = options.baseDelayMs * factor ** (attempt - 1);
  return Math.min(delay, maxDelayMs);
}
