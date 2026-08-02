import { useCallback, useState } from "react";
import type { ApplicationOperationMap, KnownOperationName } from "@dwm/application-api";
import { callOperation } from "./dwmClient.js";
import { invalidateOperation } from "./queryCache.js";
import { DwmOperationError } from "./DwmOperationError.js";

type MutationPayload<Op extends KnownOperationName> = ApplicationOperationMap[Op] extends {
  payload: infer P;
}
  ? P
  : unknown;
type MutationResult<Op extends KnownOperationName> = ApplicationOperationMap[Op] extends {
  result: infer R;
}
  ? R
  : unknown;

export type MutationStatus = "idle" | "loading" | "success" | "error";

export interface UseDwmMutationOptions {
  /** Nombres de operación cuyas consultas en caché se invalidan tras el éxito. */
  readonly invalidates?: readonly string[];
}

export interface UseDwmMutationResult<Op extends KnownOperationName> {
  readonly status: MutationStatus;
  readonly data: MutationResult<Op> | undefined;
  readonly error: DwmOperationError | undefined;
  mutate(
    payload: MutationPayload<Op>,
    options?: { readonly confirmation?: { readonly confirmed: boolean; readonly token?: string } }
  ): Promise<MutationResult<Op>>;
  reset(): void;
}

/**
 * Módulo 33A — API Client. Hook de mutación (create/update/duplicate/
 * archive/restore/delete). Bloquea envíos duplicados mientras está en
 * `loading` mediante el propio estado del componente que lo consuma
 * (documento §14 "bloquear envíos duplicados": el botón de envío debe
 * deshabilitarse mientras `status === 'loading'`).
 */
export function useDwmMutation<Op extends KnownOperationName>(
  operation: Op,
  options?: UseDwmMutationOptions
): UseDwmMutationResult<Op> {
  const [state, setState] = useState<{
    status: MutationStatus;
    data: MutationResult<Op> | undefined;
    error: DwmOperationError | undefined;
  }>({ status: "idle", data: undefined, error: undefined });

  const mutate = useCallback(
    async (
      payload: MutationPayload<Op>,
      mutateOptions?: {
        readonly confirmation?: { readonly confirmed: boolean; readonly token?: string };
      }
    ): Promise<MutationResult<Op>> => {
      setState({ status: "loading", data: undefined, error: undefined });
      try {
        const data = await callOperation(operation, payload, mutateOptions);
        setState({ status: "success", data: data as MutationResult<Op>, error: undefined });
        options?.invalidates?.forEach((op) => invalidateOperation(op));
        return data as MutationResult<Op>;
      } catch (error) {
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
        throw normalized;
      }
    },
    [operation, options?.invalidates]
  );

  const reset = useCallback(() => {
    setState({ status: "idle", data: undefined, error: undefined });
  }, []);

  return { status: state.status, data: state.data, error: state.error, mutate, reset };
}
