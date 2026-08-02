import { useMemo, useState } from "react";
import type { ToolResult } from "@dwm/environment-manager";
import { useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { FilterBar } from "../../design-system/composites/FilterBar/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { DataTable } from "../../design-system/composites/DataTable/index.js";
import { StatusBadge, type StatusTone } from "../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import "./ToolsScreen.css";

const statusTone: Record<ToolResult["status"], StatusTone> = {
  available: "success",
  missing: "danger",
  invalid: "warning",
  unsupported: "neutral",
};

/**
 * Módulo 33B — Herramientas (documento §6). `environment.list-tools`
 * real. Sin instalar/actualizar/modificar PATH: solo detección y
 * refresco de la detección (`force: true`).
 */
export function ToolsScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [force, setForce] = useState(0);

  const query = useDwmQuery("environment.list-tools", { force: force > 0 }, {});

  const tools = query.data ?? [];
  const categories = useMemo(() => Array.from(new Set(tools.map((t) => t.category))), [tools]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return tools.filter((tool) => {
      const matchesSearch = !normalized || tool.name.toLowerCase().includes(normalized);
      const matchesCategory = !category || tool.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [tools, search, category]);

  return (
    <div className="dwm-tools-screen">
      <PageHeader
        title="Herramientas"
        description="Herramientas detectadas en el entorno."
        actions={
          <Button
            variant="secondary"
            onClick={() => setForce((f) => f + 1)}
            loading={query.status === "loading" && force > 0}
          >
            Actualizar detección
          </Button>
        }
      />
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchLabel="Buscar herramientas"
        filters={
          <Select
            label="Categoría"
            options={categories.map((c) => ({ value: c, label: c }))}
            placeholder="Todas"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        }
        hasActiveFilters={Boolean(category)}
        onClear={() => setCategory("")}
      />

      {(query.status === "idle" || query.status === "loading") && (
        <Skeleton variant="block" height="200px" />
      )}
      {query.status === "error" && (
        <ErrorState
          title="No se pudieron detectar las herramientas"
          {...(query.error?.message ? { technicalDetail: query.error.message } : {})}
        />
      )}
      {query.status === "success" && filtered.length === 0 && (
        <EmptyState title="Sin herramientas que coincidan" />
      )}
      {query.status === "success" && filtered.length > 0 && (
        <DataTable
          caption="Herramientas detectadas"
          columns={[
            { key: "name", header: "Herramienta", render: (t) => t.name },
            { key: "category", header: "Categoría", render: (t) => t.category },
            { key: "version", header: "Versión", render: (t) => t.version?.raw ?? "—" },
            { key: "path", header: "Ruta autorizada", render: (t) => t.executablePath ?? "—" },
            {
              key: "status",
              header: "Estado",
              render: (t) => <StatusBadge label={t.status} tone={statusTone[t.status]} />,
            },
            { key: "reason", header: "Detalle", render: (t) => t.message ?? "—" },
          ]}
          rows={filtered}
          getRowId={(t) => t.id}
        />
      )}
    </div>
  );
}
