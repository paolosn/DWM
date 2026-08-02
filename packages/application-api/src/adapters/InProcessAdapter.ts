import { randomUUID } from "node:crypto";
import type { ApplicationAPI } from "../ApplicationAPI.js";
import type { ApplicationCallerContext, ApplicationConfirmation } from "../ApplicationRequest.js";
import type { ApplicationResponse } from "../ApplicationResponse.js";

export interface InProcessCallOptions {
  readonly caller?: ApplicationCallerContext;
  readonly confirmation?: ApplicationConfirmation;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly cancellation?: AbortSignal;
}

/**
 * Único adaptador implementado en este módulo (README §Adaptadores
 * futuros): invoca `ApplicationAPI.execute()` directamente, en el mismo
 * proceso, generando el `requestId` si no se indica. Sirve para probar la
 * API sin depender todavía de IPC de Electron, HTTP ni ningún transporte
 * real. `DesktopIPCAdapter`, `CLIAdapter` y `HTTPAdapter` quedan para una
 * fase posterior: la arquitectura (contratos + router) ya los admite sin
 * cambios.
 */
export class InProcessAdapter {
  constructor(private readonly api: ApplicationAPI) {}

  async call<TPayload = unknown>(
    operation: string,
    payload: TPayload,
    options: InProcessCallOptions = {}
  ): Promise<ApplicationResponse> {
    return this.api.execute({
      requestId: randomUUID(),
      operation,
      payload,
      ...(options.caller ? { caller: options.caller } : {}),
      ...(options.confirmation ? { confirmation: options.confirmation } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {}),
      ...(options.cancellation ? { cancellation: options.cancellation } : {}),
    });
  }
}
