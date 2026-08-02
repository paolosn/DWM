import { randomUUID } from "node:crypto";
import type { Logger } from "@dwm/logger";
import { EventEmitter, type DispatchFailure } from "./EventEmitter.js";
import type { EventEnvelope } from "./EventEnvelope.js";
import { EventPriority } from "./EventPriority.js";
import type { EventOptions } from "./EventOptions.js";
import type { EventHandler, SubscribeOptions } from "./EventHandler.js";
import type { EventSubscription } from "./EventSubscription.js";
import type { EventMiddleware } from "./middleware/Middleware.js";
import { EventBusErrorCode } from "./errors/EventBusErrorCode.js";
import { EventBusError } from "./errors/EventBusError.js";

export interface PublishResult {
  readonly eventId: string;
  readonly type: string;
  readonly matched: number;
  readonly delivered: number;
  readonly cancelledByMiddleware: boolean;
  readonly propagationStopped: boolean;
  readonly errors: readonly DispatchFailure[];
}

export interface EventBusOptions {
  /** Logger opcional para correlacionar publicaciones y fallos de suscriptor (§ "correlación con Logger"). */
  readonly logger?: Logger;
  /** Si es `true`, registra cada publicación a nivel `debug`; siempre registra fallos a nivel `error`. */
  readonly debugLogging?: boolean;
}

/**
 * Bus de eventos tipado (`TEventMap` es opcional; sin él, `type` acepta
 * cualquier cadena y el payload es `unknown`). Construye el `EventEnvelope`,
 * ejecuta la cadena de middleware, despacha a los suscriptores coincidentes
 * (con comodines) a través de `EventEmitter`, y opcionalmente correlaciona
 * cada publicación y cada fallo con un `Logger` de `@dwm/logger`.
 */
export class EventBus<TEventMap extends Record<string, unknown> = Record<string, unknown>> {
  private readonly emitter = new EventEmitter();
  private readonly middlewares: EventMiddleware[] = [];
  private readonly logger?: Logger;
  private debugLogging: boolean;

  constructor(options: EventBusOptions = {}) {
    if (options.logger) this.logger = options.logger;
    this.debugLogging = options.debugLogging ?? false;
  }

  setDebugLogging(enabled: boolean): void {
    this.debugLogging = enabled;
  }

  /** Registra un middleware; se ejecuta, en orden de registro, antes de despachar a los suscriptores. */
  use(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
  }

  subscribe<K extends string>(
    pattern: K,
    handler: EventHandler<K extends keyof TEventMap ? TEventMap[K] : unknown>,
    options?: SubscribeOptions
  ): EventSubscription {
    return this.emitter.subscribe(pattern, handler as EventHandler, options);
  }

  once<K extends string>(
    pattern: K,
    handler: EventHandler<K extends keyof TEventMap ? TEventMap[K] : unknown>,
    options?: SubscribeOptions
  ): EventSubscription {
    return this.emitter.once(pattern, handler as EventHandler, options);
  }

  unsubscribe(subscription: EventSubscription): void {
    subscription.unsubscribe();
  }

  async publish<K extends string>(
    type: K,
    payload: K extends keyof TEventMap ? TEventMap[K] : unknown,
    options: EventOptions = {}
  ): Promise<PublishResult> {
    const envelope: EventEnvelope = {
      id: randomUUID(),
      type,
      payload,
      priority: options.priority ?? EventPriority.NORMAL,
      timestamp: new Date().toISOString(),
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      ...(options.source ? { source: options.source } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {}),
    };

    await this.logPublish(envelope);

    const reachedDispatch = await this.runMiddlewareChain(envelope);
    if (!reachedDispatch) {
      return {
        eventId: envelope.id,
        type: envelope.type,
        matched: 0,
        delivered: 0,
        cancelledByMiddleware: true,
        propagationStopped: false,
        errors: [],
      };
    }

    const result = await this.emitter.dispatch(envelope, options.mode ?? "sync");
    await this.logErrors(envelope, result.errors);

    return {
      eventId: envelope.id,
      type: envelope.type,
      matched: result.matched,
      delivered: result.delivered,
      cancelledByMiddleware: false,
      propagationStopped: result.propagationStopped,
      errors: result.errors,
    };
  }

  subscriptionCount(): number {
    return this.emitter.subscriptionCount();
  }

  disposeAll(): void {
    this.emitter.disposeAll();
  }

  private async runMiddlewareChain(envelope: EventEnvelope): Promise<boolean> {
    let reachedEnd = false;
    let chain: () => Promise<void> = async () => {
      reachedEnd = true;
    };

    for (let i = this.middlewares.length - 1; i >= 0; i -= 1) {
      const middleware = this.middlewares[i]!;
      const next = chain;
      chain = async () => {
        await middleware(envelope, next);
      };
    }

    try {
      await chain();
    } catch (err) {
      throw EventBusError.wrap(err, {
        code: EventBusErrorCode.EVENTBUS_MIDDLEWARE_FAILED,
        origin: "middleware",
        recoverable: false,
        message: `Fallo en la cadena de middleware al publicar "${envelope.type}".`,
      });
    }

    return reachedEnd;
  }

  private async logPublish(envelope: EventEnvelope): Promise<void> {
    if (!this.logger || !this.debugLogging) return;
    await this.logger
      .withCorrelationId(envelope.correlationId ?? envelope.id)
      .debug(`event:publish ${envelope.type}`, { priority: envelope.priority });
  }

  private async logErrors(
    envelope: EventEnvelope,
    errors: readonly DispatchFailure[]
  ): Promise<void> {
    if (!this.logger || errors.length === 0) return;
    const correlated = this.logger.withCorrelationId(envelope.correlationId ?? envelope.id);
    for (const failure of errors) {
      await correlated.error(`event:handler-error ${envelope.type}`, {
        subscriptionId: failure.subscriptionId,
        error: failure.error instanceof Error ? failure.error.message : String(failure.error),
      });
    }
  }
}
