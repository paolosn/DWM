import type { CoreEventPayloads } from "./EventTypes.js";
import { DWMError } from "../errors/DWMError.js";
import { ErrorCode } from "../errors/ErrorCodes.js";

/**
 * Mapa de eventos que acepta el bus: el namespace `core:*` está tipado de
 * forma estricta (CoreEventPayloads); cualquier otro namespace (usado por
 * módulos externos para sus propios eventos de dominio) se acepta con un
 * payload de tipo `unknown`, sin que el Core necesite conocerlo de antemano.
 */
export type AnyEventPayloads = CoreEventPayloads & Record<string, unknown>;

export type EventHandler<T = unknown> = (payload: T) => void;
export type UnsubscribeFn = () => void;

const CORE_NAMESPACE_PREFIX = "core:";

/**
 * Superficie de eventos que reciben los módulos y adaptadores externos a
 * través de `ModuleContext.eventBus` (README §12, regla I).
 *
 * - **Suscripción (`on`/`once`/`off`)**: sin restricciones. Un módulo puede
 *   suscribirse tanto a eventos `core:*` (para reaccionar al ciclo de vida
 *   del Core) como a eventos de dominio de otros módulos.
 * - **Emisión (`emit`)**: restringida. El namespace `core:*` es un catálogo
 *   cerrado que **solo el propio Core emite** (README §6); un módulo externo
 *   que intente emitir un evento `core:*` recibe un `DWMError`
 *   (`RESERVED_EVENT_NAMESPACE`). Cualquier otro namespace es de libre uso
 *   para eventos de dominio propios del módulo.
 *
 * Esto evita que un módulo externo pueda falsificar eventos del ciclo de
 * vida del Core (por ejemplo, emitir un `core:ready` falso), sin dejar de
 * ofrecerle un canal de comunicación desacoplado y completamente abierto
 * para sus propios eventos.
 */
export interface ScopedEventBus {
  on(eventType: string, handler: EventHandler<unknown>): UnsubscribeFn;
  once(eventType: string, handler: EventHandler<unknown>): void;
  off(eventType: string, handler: EventHandler<unknown>): void;
  emit(eventType: string, payload: unknown): void;
}

/**
 * Bus de eventos síncrono, publicador/suscriptor (README §6).
 * Un fallo en un suscriptor no interrumpe a los demás: se aísla y se reporta
 * mediante `core:listener-error`.
 */
export class EventBus {
  private readonly listeners: Map<string, Set<EventHandler<unknown>>> = new Map();

  // Sobrecargas: el namespace core:* queda tipado de forma estricta; cualquier
  // otro namespace (eventos de dominio de módulos externos) acepta un payload
  // `unknown`, sin que el Core necesite conocerlo de antemano.
  on<K extends keyof CoreEventPayloads>(
    eventType: K,
    handler: EventHandler<CoreEventPayloads[K]>
  ): UnsubscribeFn;
  on(eventType: string, handler: EventHandler<unknown>): UnsubscribeFn;
  on(eventType: string, handler: EventHandler<unknown>): UnsubscribeFn {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);
    return () => this.off(eventType, handler);
  }

  once<K extends keyof CoreEventPayloads>(
    eventType: K,
    handler: EventHandler<CoreEventPayloads[K]>
  ): void;
  once(eventType: string, handler: EventHandler<unknown>): void;
  once(eventType: string, handler: EventHandler<unknown>): void {
    const wrapper: EventHandler<unknown> = (payload) => {
      this.off(eventType, wrapper);
      handler(payload);
    };
    this.on(eventType, wrapper);
  }

  off<K extends keyof CoreEventPayloads>(
    eventType: K,
    handler: EventHandler<CoreEventPayloads[K]>
  ): void;
  off(eventType: string, handler: EventHandler<unknown>): void;
  off(eventType: string, handler: EventHandler<unknown>): void {
    this.listeners.get(eventType)?.delete(handler);
  }

  emit<K extends keyof CoreEventPayloads>(eventType: K, payload: CoreEventPayloads[K]): void;
  emit(eventType: string, payload: unknown): void;
  emit(eventType: string, payload: unknown): void {
    const handlers = this.listeners.get(eventType);
    if (!handlers || handlers.size === 0) return;

    // Se itera sobre una copia para tolerar que un handler se desuscriba a sí mismo.
    for (const handler of [...handlers]) {
      try {
        handler(payload);
      } catch (err) {
        this.reportListenerError(eventType, err);
      }
    }
  }

  /** Número de suscriptores activos para un evento; útil en pruebas y diagnóstico. */
  listenerCount(eventType: keyof AnyEventPayloads | string): number {
    return this.listeners.get(eventType as string)?.size ?? 0;
  }

  /**
   * Crea la superficie restringida (`ScopedEventBus`) que se entrega a
   * módulos y adaptadores externos vía `ModuleContext` (README §12, regla I).
   */
  createScopedEmitter(): ScopedEventBus {
    return {
      on: (eventType, handler) => this.on(eventType, handler),
      once: (eventType, handler) => this.once(eventType, handler),
      off: (eventType, handler) => this.off(eventType, handler),
      emit: (eventType, payload) => {
        if (eventType.startsWith(CORE_NAMESPACE_PREFIX)) {
          throw new DWMError({
            code: ErrorCode.RESERVED_EVENT_NAMESPACE,
            message: `El namespace "${CORE_NAMESPACE_PREFIX}*" está reservado al Core; un módulo externo no puede emitir "${eventType}".`,
            origin: "event-bus",
            recoverable: true,
          });
        }
        this.emit(eventType, payload);
      },
    };
  }

  private reportListenerError(eventType: string, error: unknown): void {
    // Se emite en un evento distinto para no reentrar infinitamente si el
    // propio listener de core:listener-error también falla sin control.
    if (eventType === "core:listener-error") return;
    const handlers = this.listeners.get("core:listener-error");
    if (!handlers) return;
    for (const handler of [...handlers]) {
      try {
        handler({ eventType, error });
      } catch {
        // Se descarta deliberadamente: un fallo aquí no debe propagarse.
      }
    }
  }
}
