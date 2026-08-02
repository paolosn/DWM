/** Configuración del planificador (concurrencia y valores por defecto). */
export interface SchedulerConfiguration {
  /** Número máximo de ejecuciones simultáneas. Por defecto: 1. */
  readonly maxConcurrency?: number;
  /** Tiempo de gracia, en milisegundos, que `shutdown()` espera a que terminen las ejecuciones en curso. */
  readonly shutdownGraceMs?: number;
}

export function resolveSchedulerConfiguration(
  config: SchedulerConfiguration
): Required<SchedulerConfiguration> {
  return {
    maxConcurrency: config.maxConcurrency ?? 1,
    shutdownGraceMs: config.shutdownGraceMs ?? 30_000,
  };
}
