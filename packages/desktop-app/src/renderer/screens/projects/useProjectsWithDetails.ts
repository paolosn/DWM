import { useEffect, useRef, useState } from "react";
import type { Project } from "@dwm/project";
import { callOperation, DwmOperationError, useDwmQuery } from "../../api-client/index.js";

export type ProjectsStatus = "idle" | "loading" | "success" | "error";

export interface ProjectsWithDetailsResult {
  readonly status: ProjectsStatus;
  readonly projects: readonly Project[];
  readonly error: DwmOperationError | undefined;
  readonly refetch: () => void;
}

/**
 * Módulo 33A — Fase 3: Proyectos. `projects.list` solo devuelve IDs
 * (documento de contratos real de Application API), así que para
 * mostrar nombre/ruta/estado hace falta pedir el detalle de cada uno con
 * `projects.get` — ambas operaciones públicas reales, sin datos
 * inventados. Es lógica específica de esta pantalla, no del framework de
 * entidades: por eso vive aquí y no en `api-client/` ni en `entities/`.
 */
export function useProjectsWithDetails(): ProjectsWithDetailsResult {
  const listQuery = useDwmQuery("projects.list", {});
  const [detailsStatus, setDetailsStatus] = useState<ProjectsStatus>("idle");
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [error, setError] = useState<DwmOperationError | undefined>(undefined);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (listQuery.status !== "success") return;
    const ids = listQuery.data ?? [];
    if (ids.length === 0) {
      setProjects([]);
      setDetailsStatus("success");
      return;
    }
    const fetchId = ++fetchIdRef.current;
    setDetailsStatus("loading");
    Promise.all(ids.map((id) => callOperation("projects.get", { id })))
      .then((results) => {
        if (fetchIdRef.current !== fetchId) return;
        setProjects(results.filter((project): project is Project => project !== undefined));
        setDetailsStatus("success");
      })
      .catch((err: unknown) => {
        if (fetchIdRef.current !== fetchId) return;
        setError(
          err instanceof DwmOperationError
            ? err
            : new DwmOperationError("projects.get", {
                code: "DESKTOP_UNKNOWN_ERROR",
                message: err instanceof Error ? err.message : "Error desconocido.",
                category: "unknown",
                retryable: true,
              })
        );
        setDetailsStatus("error");
      });
  }, [listQuery.status, listQuery.data]);

  if (listQuery.status === "error") {
    return { status: "error", projects: [], error: listQuery.error, refetch: listQuery.refetch };
  }
  if (listQuery.status === "idle" || listQuery.status === "loading") {
    return { status: "loading", projects: [], error: undefined, refetch: listQuery.refetch };
  }
  return { status: detailsStatus, projects, error, refetch: listQuery.refetch };
}
