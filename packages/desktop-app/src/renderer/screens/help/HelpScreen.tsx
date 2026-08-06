import { useMemo, useState } from "react";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { FilterBar } from "../../design-system/composites/FilterBar/index.js";
import { ResourceCard } from "../../design-system/composites/ResourceCard/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { HELP_TOPICS } from "./helpContent.js";
import { OnboardingScreen } from "../onboarding/OnboardingScreen.js";
import "./HelpScreen.css";

/**
 * Módulo 33B — Ayuda (documento §13): contenido local navegable con
 * búsqueda exclusivamente local. También es el punto de acceso a
 * reabrir el asistente de Primer inicio (§1), que no forma parte del
 * Sidebar permanente (no está en la lista de secciones a activar).
 */
export function HelpScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return HELP_TOPICS;
    return HELP_TOPICS.filter(
      (topic) =>
        topic.title.toLowerCase().includes(normalized) ||
        topic.body.toLowerCase().includes(normalized)
    );
  }, [search]);

  if (showOnboarding) {
    return (
      <div className="dwm-help-screen">
        <Button variant="secondary" onClick={() => setShowOnboarding(false)}>
          Volver a Ayuda
        </Button>
        <OnboardingScreen />
      </div>
    );
  }

  return (
    <div className="dwm-help-screen">
      <PageHeader
        title="Ayuda"
        description="Contenido local de ayuda sobre DWM."
        actions={
          <Button variant="secondary" onClick={() => setShowOnboarding(true)}>
            Reabrir asistente de bienvenida
          </Button>
        }
      />
      <FilterBar searchValue={search} onSearchChange={setSearch} searchLabel="Buscar en la ayuda" />
      {filtered.length === 0 ? (
        <EmptyState title="Sin resultados para esta búsqueda" />
      ) : (
        <div className="dwm-help-screen__list">
          {filtered.map((topic) => (
            <ResourceCard key={topic.id} title={topic.title} description={topic.body} />
          ))}
        </div>
      )}
    </div>
  );
}
