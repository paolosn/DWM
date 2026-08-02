import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useDwmQuery } from "../../api-client/index.js";
import { NAVIGATION_CATALOG } from "../navigationCatalog.js";
import type { DesktopNavigationSection } from "../../../shared/types/DesktopConfig.js";
import "./CommandPalette.css";

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onNavigate: (section: DesktopNavigationSection) => void;
}

interface ResultItem {
  readonly id: string;
  readonly label: string;
  readonly context: DesktopNavigationSection;
}

interface ResultGroup {
  readonly type: string;
  readonly items: readonly ResultItem[];
}

/**
 * Módulo 33A — Buscador global (documento §10). Ctrl/Cmd+K para abrir,
 * Escape para cerrar, flechas + Enter para navegar/ejecutar. Los
 * resultados de Agentes/Skills/Reglas/Clientes/Proyectos filtran en
 * cliente sobre sus operaciones `*.list` reales (no existe una operación
 * de búsqueda para ellos); Conocimiento usa `knowledge.search` real,
 * igual que en su propia pantalla. Seleccionar un resultado navega a la
 * sección del recurso — no hay ruteo por recurso individual todavía
 * (limitación documentada de la Fase 1: sin canal IPC para rutas
 * persistidas más allá de la sección), así que no se simula un enlace
 * directo al elemento.
 */
export function CommandPalette({
  open,
  onClose,
  onNavigate,
}: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = query.trim().length > 0;
  const normalized = query.trim().toLowerCase();

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const agentsQuery = useDwmQuery("agents.list", {}, { enabled: open && hasQuery });
  const skillsQuery = useDwmQuery("skills.list", {}, { enabled: open && hasQuery });
  const rulesQuery = useDwmQuery("rules.list", {}, { enabled: open && hasQuery });
  const clientsQuery = useDwmQuery("clients.list", {}, { enabled: open && hasQuery });
  const projectsQuery = useDwmQuery("projects.list", {}, { enabled: open && hasQuery });
  const knowledgeQuery = useDwmQuery("knowledge.search", { query }, { enabled: open && hasQuery });

  const actionResults = useMemo(
    () =>
      NAVIGATION_CATALOG.filter(
        (item) => !hasQuery || item.label.toLowerCase().includes(normalized)
      ).map((item) => ({ id: item.section, label: `Ir a ${item.label}`, context: item.section })),
    [normalized, hasQuery]
  );

  const groups: readonly ResultGroup[] = useMemo(() => {
    if (!hasQuery) return [{ type: "Acciones", items: actionResults }];
    const result: ResultGroup[] = [];
    const agents = (agentsQuery.data ?? []).filter(
      (a) =>
        a.id.toLowerCase().includes(normalized) || (a.name ?? "").toLowerCase().includes(normalized)
    );
    if (agents.length > 0) {
      result.push({
        type: "Agentes",
        items: agents.map((a) => ({ id: a.id, label: a.name ?? a.id, context: "agents" as const })),
      });
    }
    const skills = (skillsQuery.data ?? []).filter(
      (s) =>
        s.id.toLowerCase().includes(normalized) ||
        (s.title ?? "").toLowerCase().includes(normalized)
    );
    if (skills.length > 0) {
      result.push({
        type: "Skills",
        items: skills.map((s) => ({
          id: s.id,
          label: s.title ?? s.id,
          context: "skills" as const,
        })),
      });
    }
    const rules = (rulesQuery.data ?? []).filter(
      (r) =>
        r.id.toLowerCase().includes(normalized) ||
        (r.title ?? "").toLowerCase().includes(normalized)
    );
    if (rules.length > 0) {
      result.push({
        type: "Reglas",
        items: rules.map((r) => ({ id: r.id, label: r.title ?? r.id, context: "rules" as const })),
      });
    }
    const knowledge = knowledgeQuery.data ?? [];
    if (knowledge.length > 0) {
      result.push({
        type: "Conocimiento",
        items: knowledge.map((k) => ({
          id: k.id,
          label: k.title ?? k.id,
          context: "knowledge" as const,
        })),
      });
    }
    const clients = (clientsQuery.data ?? []).filter(
      (c) => c.name.toLowerCase().includes(normalized) || c.slug.toLowerCase().includes(normalized)
    );
    if (clients.length > 0) {
      result.push({
        type: "Clientes",
        items: clients.map((c) => ({ id: c.id, label: c.name, context: "clients" as const })),
      });
    }
    const projects = (projectsQuery.data ?? []).filter((id) =>
      id.toLowerCase().includes(normalized)
    );
    if (projects.length > 0) {
      result.push({
        type: "Proyectos",
        items: projects.map((id) => ({ id, label: id, context: "projects" as const })),
      });
    }
    const actions = actionResults;
    if (actions.length > 0) {
      result.push({ type: "Acciones", items: actions });
    }
    return result;
  }, [
    hasQuery,
    normalized,
    agentsQuery.data,
    skillsQuery.data,
    rulesQuery.data,
    knowledgeQuery.data,
    clientsQuery.data,
    projectsQuery.data,
    actionResults,
  ]);

  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  function select(context: DesktopNavigationSection): void {
    onNavigate(context);
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(flatItems.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flatItems[activeIndex];
      if (item) select(item.context);
    }
  }

  if (!open) return null;

  return (
    <div className="dwm-command-palette__overlay" onClick={onClose}>
      <div
        className="dwm-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Buscador global"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          className="dwm-command-palette__input"
          placeholder="Buscar proyectos, agentes, skills, reglas, conocimiento, clientes o acciones…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
        />
        <div className="dwm-command-palette__results">
          {flatItems.length === 0 && <p className="dwm-command-palette__empty">Sin resultados</p>}
          {groups.map((group) => (
            <div key={group.type} className="dwm-command-palette__group">
              <p className="dwm-command-palette__group-label">{group.type}</p>
              <ul>
                {group.items.map((item) => {
                  const flatIndex = flatItems.findIndex(
                    (flat) => flat.id === item.id && flat.context === item.context
                  );
                  return (
                    <li key={`${item.context}-${item.id}`}>
                      <button
                        type="button"
                        data-active={flatIndex === activeIndex}
                        className="dwm-command-palette__item"
                        onClick={() => select(item.context)}
                      >
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
