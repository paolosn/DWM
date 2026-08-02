import { useEffect, useRef, useState } from "react";
import { DwmOperationError } from "../../api-client/index.js";

export type CollectionStatus = "idle" | "loading" | "success" | "error";

export interface DescriptorCollectionResult<T> {
  readonly status: CollectionStatus;
  readonly items: readonly T[];
  readonly error: DwmOperationError | undefined;
}

/**
 * Módulo 33A — Centro de operaciones (§11). `backups`/`verification`/
 * `restore` comparten el mismo patrón real: `*.list` devuelve solo IDs,
 * `*.get(id)` devuelve el descriptor completo. Es lógica específica de
 * esta pantalla (igual que `useProjectsWithDetails` lo es de Proyectos),
 * no del framework de entidades: no hay operación de duplicar/archivar
 * aquí, son ejecuciones, no recursos CRUD.
 */
export function useDescriptorCollection<T>(
  listFn: () => Promise<readonly string[]>,
  getFn: (id: string) => Promise<T | undefined>,
  deps: readonly unknown[]
): DescriptorCollectionResult<T> {
  const [status, setStatus] = useState<CollectionStatus>("idle");
  const [items, setItems] = useState<readonly T[]>([]);
  const [error, setError] = useState<DwmOperationError | undefined>(undefined);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const fetchId = ++fetchIdRef.current;
    setStatus("loading");
    listFn()
      .then((ids) => {
        if (ids.length === 0) return [] as Array<T | undefined>;
        return Promise.all(ids.map((id) => getFn(id)));
      })
      .then((results: Array<T | undefined>) => {
        if (fetchIdRef.current !== fetchId) return;
        setItems(results.filter((item): item is T => item !== undefined));
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (fetchIdRef.current !== fetchId) return;
        setError(
          err instanceof DwmOperationError
            ? err
            : new DwmOperationError("unknown", {
                code: "DESKTOP_UNKNOWN_ERROR",
                message: err instanceof Error ? err.message : "Error desconocido.",
                category: "unknown",
                retryable: true,
              })
        );
        setStatus("error");
      });
  }, deps);

  return { status, items, error };
}
