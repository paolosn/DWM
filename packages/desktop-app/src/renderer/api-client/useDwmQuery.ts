import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApplicationOperationMap, KnownOperationName } from "@dwm/application-api";
import { callOperation } from "./dwmClient.js";
import { getCached, makeQueryKey, setCached, subscribe } from "./queryCache.js";
import { DwmOperationError } from "./DwmOperationError.js";

type QueryPayload<Op extends KnownOperationName> = ApplicationOperationMap[Op] extends {
  payload: infer P;
}
  ? P
  : unknown;
type QueryResult<Op extends KnownOperationName> = ApplicationOperationMap[Op] extends {
  result: infer R;
}
  ? R
  : unknown;

export type QueryStatus = "idle" | "loading" | "success" | "error";

export interface UseDwmQueryResult<T> {
  readonly status: QueryStatus;
  readonly data: T | undefined;
  readonly error: DwmOperationError | undefined;
  readonly refetch: () => void;
}

export interface UseDwmQueryOptions {
  /** Si es `false`, no se ejecuta la consulta (documento §16: evitar llamadas duplicadas/innecesarias). */
  readonly enabled?: boolean;
}

/**
 * Módulo 33A — API Client. Hook de consulta de solo lectura sobre
 * `callOperation`. Se re-ejecuta automáticamente cuando otra parte de la
 * app invalida la operación (p. ej. tras una mutación de `useDwmMutation`
 * con `invalidates`), cubriendo el requisito de §16 "invalidar o
 * actualizar los datos tras mutaciones" sin acoplar entre sí los
 * componentes que consultan y los que mutan.
 */
export function useDwmQuery<Op extends KnownOperationName>(
  operation: Op,
  payload: QueryPayload<Op>,
  options?: UseDwmQueryOptions
): UseDwmQueryResult<QueryResult<Op>> {
  const enabled = options?.enabled ?? true;
  const key = useMemo(() => makeQueryKey(operation, payload), [operation, payload]);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const [state, setState] = useState<{
    status: QueryStatus;
    data: QueryResult<Op> | undefined;
    error: DwmOperationError | undefined;
  }>(() => {
    const cached = getCached<QueryResult<Op>>(key);
    return cached !== undefined
      ? { status: "success", data: cached, error: undefined }
      : { status: enabled ? "loading" : "idle", data: undefined, error: undefined };
  });

  const runFetch = useCallback(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((current) => ({ ...current, status: "loading", error: undefined }));
    callOperation(operation, payloadRef.current)
      .then((data) => {
        if (cancelled) return;
        setCached(key, data);
        setState({ status: "success", data: data as QueryResult<Op>, error: undefined });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const normalized =
          error instanceof DwmOperationError
            ? error
            : new DwmOperationError(operation, {
                code: "DESKTOP_UNKNOWN_ERROR",
                message: error instanceof Error ? error.message : "Error desconocido.",
                category: "unknown",
                retryable: true,
              });
        setState({ status: "error", data: undefined, error: normalized });
      });
    return () => {
      cancelled = true;
    };
  }, [operation, key, enabled]);

  useEffect(() => {
    const cancel = runFetch();
    return cancel;
  }, [runFetch]);

  useEffect(() => subscribe(key, () => runFetch()), [key, runFetch]);

  return { status: state.status, data: state.data, error: state.error, refetch: runFetch };
}
