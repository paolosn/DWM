import type { ApplicationCapability } from "./ApplicationTypes.js";

/** Metadatos de frontera libres, nunca interpretados como capacidades ni permisos. */
export type ApplicationRequestMetadata = Readonly<Record<string, unknown>>;

/**
 * Contexto del invocador. `privileged: true` es el "contexto privilegiado
 * interno explícito" exigido por el README del módulo: solo código interno
 * de confianza (por ejemplo, un adaptador in-process de otro módulo del
 * Core) debe poder construirlo. Nunca se deriva implícitamente de otros
 * campos de la solicitud.
 */
export interface ApplicationCallerContext {
  readonly id?: string;
  readonly privileged?: boolean;
  readonly grantedCapabilities?: readonly ApplicationCapability[];
}

/**
 * Confirmación explícita y verificable exigida por las operaciones
 * destructivas (eliminar, sobrescribir, restaurar, importar con reemplazo).
 * La ausencia de `confirmed: true` impide la ejecución.
 */
export interface ApplicationConfirmation {
  readonly confirmed: boolean;
  /** Token opcional de confirmación (p. ej. eco del `requestId`) para reforzar la intencionalidad. */
  readonly token?: string;
}

/** Contrato mínimo de toda solicitud recibida por la Application API. */
export interface ApplicationRequest<TPayload = unknown> {
  readonly requestId: string;
  readonly operation: string;
  readonly payload: TPayload;
  readonly metadata?: ApplicationRequestMetadata;
  readonly caller?: ApplicationCallerContext;
  readonly cancellation?: AbortSignal;
  readonly confirmation?: ApplicationConfirmation;
}

/**
 * Tabla de tipado discriminado por operación: cada operación reconocida
 * declara su `payload` y su `result`. `ApplicationRouter`/`ApplicationAPI`
 * usan esta tabla para ofrecer sobrecargas tipadas en `execute()`; las
 * operaciones que no aparecen aquí (futuras extensiones registradas en
 * tiempo de ejecución vía `ApplicationOperationRegistry`) siguen siendo
 * invocables mediante la forma genérica `ApplicationRequest<unknown>`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ApplicationOperationMap {
  // Se amplía por módulo mediante "declaration merging" desde cada
  // controlador (ver controllers/*.ts), manteniendo un único punto de
  // verdad para el tipado de cada operación sin un archivo monolítico.
}

export type KnownOperationName = keyof ApplicationOperationMap;

export type TypedApplicationRequest<Op extends KnownOperationName> = ApplicationRequest<
  ApplicationOperationMap[Op] extends { payload: infer P } ? P : unknown
> & { readonly operation: Op };
