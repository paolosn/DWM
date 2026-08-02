import type { EventEnvelope } from "./EventEnvelope.js";
import type { EventHandler, SubscribeOptions } from "./EventHandler.js";
import type { EventSubscription } from "./EventSubscription.js";
import type { EventDispatchMode } from "./EventOptions.js";
import { PropagationControl } from "./PropagationControl.js";
import { assertValidPattern, matchesPattern } from "./patternMatching.js";

interface InternalSubscription {
  id: string;
  pattern: string;
  priority: number;
  once: boolean;
  filter?: (envelope: EventEnvelope) => boolean;
  handler: EventHandler;
}

export interface DispatchFailure {
  readonly subscriptionId: string;
  readonly error: unknown;
}

export interface DispatchResult {
  readonly matched: number;
  readonly delivered: number;
  readonly propagationStopped: boolean;
  readonly errors: readonly DispatchFailure[];
}

/**
 * Motor de bajo nivel de publicación/suscripción: mantiene el registro de
 * suscripciones (con patrón, prioridad y filtro), resuelve coincidencias
 * (incluyendo comodines) y despacha un `EventEnvelope` ya construido en
 * modo síncrono o asíncrono. No conoce middleware, tipado de eventos ni
 * integración con Logger: esas capas las añade `EventBus`.
 */
export class EventEmitter {
  private readonly subscriptions: InternalSubscription[] = [];
  private sequence = 0;

  subscribe(
    pattern: string,
    handler: EventHandler,
    options: SubscribeOptions = {}
  ): EventSubscription {
    assertValidPattern(pattern);
    this.sequence += 1;
    const record: InternalSubscription = {
      id: `sub-${this.sequence}`,
      pattern,
      priority: options.priority ?? 0,
      once: false,
      handler,
      ...(options.filter ? { filter: options.filter } : {}),
    };
    this.subscriptions.push(record);
    return this.toHandle(record);
  }

  once(pattern: string, handler: EventHandler, options: SubscribeOptions = {}): EventSubscription {
    assertValidPattern(pattern);
    this.sequence += 1;
    const record: InternalSubscription = {
      id: `sub-${this.sequence}`,
      pattern,
      priority: options.priority ?? 0,
      once: true,
      handler: async (envelope, control) => {
        this.unsubscribeById(record.id);
        await handler(envelope, control);
      },
      ...(options.filter ? { filter: options.filter } : {}),
    };
    this.subscriptions.push(record);
    return this.toHandle(record);
  }

  unsubscribeById(id: string): void {
    const index = this.subscriptions.findIndex((s) => s.id === id);
    if (index !== -1) this.subscriptions.splice(index, 1);
  }

  subscriptionCount(): number {
    return this.subscriptions.length;
  }

  disposeAll(): void {
    this.subscriptions.length = 0;
  }

  async dispatch(envelope: EventEnvelope, mode: EventDispatchMode): Promise<DispatchResult> {
    const matched = this.subscriptions
      .filter((s) => matchesPattern(s.pattern, envelope.type))
      .filter((s) => !s.filter || s.filter(envelope))
      .sort((a, b) => b.priority - a.priority);

    const control = new PropagationControl();
    const errors: DispatchFailure[] = [];
    let delivered = 0;

    if (mode === "sync") {
      for (const subscription of matched) {
        if (control.isStopped) break;
        try {
          await subscription.handler(envelope, control);
          delivered += 1;
        } catch (error) {
          errors.push({ subscriptionId: subscription.id, error });
        }
      }
    } else {
      const settled = await Promise.allSettled(
        matched.map((subscription) =>
          Promise.resolve().then(() => subscription.handler(envelope, control))
        )
      );
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          delivered += 1;
        } else {
          errors.push({ subscriptionId: matched[index]!.id, error: result.reason });
        }
      });
    }

    return { matched: matched.length, delivered, propagationStopped: control.isStopped, errors };
  }

  private toHandle(record: InternalSubscription): EventSubscription {
    return {
      id: record.id,
      pattern: record.pattern,
      priority: record.priority,
      once: record.once,
      unsubscribe: () => this.unsubscribeById(record.id),
    };
  }
}
