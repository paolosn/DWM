import type { ApplicationRequest } from "../../../src/ApplicationRequest.js";

let counter = 0;

/** Genera un requestId único y seguro para cada prueba (evita colisiones de duplicado entre tests). */
export function nextRequestId(prefix = "req"): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export function makeRequest<TPayload>(
  operation: string,
  payload: TPayload,
  overrides: Partial<ApplicationRequest<TPayload>> = {}
): ApplicationRequest<TPayload> {
  return {
    requestId: nextRequestId(),
    operation,
    payload,
    ...overrides,
  };
}
