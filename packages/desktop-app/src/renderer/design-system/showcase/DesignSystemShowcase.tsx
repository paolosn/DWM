import { useState } from "react";
import { Home, Rocket, Bot } from "lucide-react";
import { PageHeader } from "../composites/PageHeader/index.js";
import { SectionHeader } from "../composites/SectionHeader/index.js";
import { StatCard } from "../composites/StatCard/index.js";
import { ActionCard } from "../composites/ActionCard/index.js";
import { ResourceCard } from "../composites/ResourceCard/index.js";
import { EntityCard } from "../composites/EntityCard/index.js";
import {
  StatusBadge,
  STATUS_PRESETS,
  type StatusPresetKey,
} from "../primitives/StatusBadge/index.js";
import { EmptyState } from "../composites/EmptyState/index.js";
import { ErrorState } from "../composites/ErrorState/index.js";
import { Skeleton } from "../composites/Skeleton/index.js";
import { InlineAlert } from "../composites/InlineAlert/index.js";
import { FilterBar } from "../composites/FilterBar/index.js";
import { Tabs } from "../composites/Tabs/index.js";
import { ConfirmDialog } from "../composites/ConfirmDialog/index.js";
import { PreviewDialog } from "../composites/PreviewDialog/index.js";
import { FormSection } from "../composites/FormSection/index.js";
import { Button } from "../primitives/Button/index.js";
import { TextField } from "../primitives/TextField/index.js";
import "./DesignSystemShowcase.css";

/**
 * Sistema visual base (Fase 1) — pantalla de referencia real, accesible
 * solo en desarrollo (nunca en producción ni desde la navegación
 * normal): muestra cada componente base con datos de ejemplo y sus
 * estados reales (normal/loading/error/vacío/disabled), para que
 * cualquier pantalla nueva o migrada se compare visualmente contra
 * esto en vez de inventar un estilo propio.
 */
export function DesignSystemShowcase(): JSX.Element {
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="dwm-showcase">
      <PageHeader
        title="Sistema visual — referencia"
        description="Solo desarrollo: cada componente base con sus estados reales."
        actions={<Button>Acción principal</Button>}
      />

      <section className="dwm-showcase__section">
        <SectionHeader
          title="SectionHeader"
          description="Cabecera de sección"
          badge={<StatusBadge label="12" tone="neutral" />}
          action={<Button variant="secondary">Ver todo</Button>}
        />
      </section>

      <section className="dwm-showcase__section">
        <SectionHeader title="StatCard" />
        <div className="dwm-showcase__grid">
          <StatCard icon={<Home size={18} />} value={12} label="Proyectos" />
          <StatCard value={3} label="Conflictos" trend="+1 esta semana" trendDirection="up" />
          <StatCard value={0} label="Pendientes" trend="Sin cambios" trendDirection="flat" />
        </div>
      </section>

      <section className="dwm-showcase__section">
        <SectionHeader title="ActionCard" />
        <div className="dwm-showcase__grid">
          <ActionCard
            icon={<Rocket size={20} />}
            title="Nuevo trabajo"
            description="Crea un proyecto real."
            ctaLabel="Empezar"
            onAction={() => {}}
          />
          <ActionCard
            icon={<Bot size={20} />}
            title="Deshabilitada"
            description="Estado disabled."
            ctaLabel="No disponible"
            onAction={() => {}}
            disabled
          />
          <ActionCard
            title="Cargando"
            description="Estado loading."
            ctaLabel="Procesando"
            onAction={() => {}}
            loading
          />
        </div>
      </section>

      <section className="dwm-showcase__section">
        <SectionHeader title="ResourceCard (con accentColor)" />
        <div className="dwm-showcase__grid">
          <ResourceCard
            title="Agente"
            description="accentColor=accent"
            accentColor="accent"
            meta={<StatusBadge {...STATUS_PRESETS.activo} />}
            trailing={<Button variant="secondary">Editar</Button>}
          />
          <ResourceCard
            title="Skill"
            description="accentColor=success"
            accentColor="success"
            meta={<StatusBadge {...STATUS_PRESETS.sincronizado} />}
          />
          <ResourceCard
            title="Regla"
            description="accentColor=warning"
            accentColor="warning"
            meta={<StatusBadge {...STATUS_PRESETS.pendiente} />}
          />
          <ResourceCard
            title="Clicable"
            description="onClick real"
            accentColor="danger"
            onClick={() => {}}
            meta={<StatusBadge {...STATUS_PRESETS.conflicto} />}
          />
        </div>
      </section>

      <section className="dwm-showcase__section">
        <SectionHeader title="EntityCard" />
        <div className="dwm-showcase__grid">
          <EntityCard
            name="MCI Finance"
            description="mci-finance"
            status={<StatusBadge {...STATUS_PRESETS.activo} />}
            stats={[
              { label: "Proyectos", value: 4 },
              { label: "Conexiones", value: 2 },
            ]}
            lastActivityLabel="Última actividad: hoy"
            primaryActions={<Button>Ver cliente</Button>}
            onClick={() => {}}
          />
        </div>
      </section>

      <section className="dwm-showcase__section">
        <SectionHeader title="StatusBadge — los 10 estados normalizados (STATUS_PRESETS)" />
        <div className="dwm-showcase__badges">
          {(Object.keys(STATUS_PRESETS) as StatusPresetKey[]).map((key) => (
            <StatusBadge key={key} {...STATUS_PRESETS[key]} />
          ))}
        </div>
      </section>

      <section className="dwm-showcase__section">
        <SectionHeader title="EmptyState / ErrorState / Skeleton / InlineAlert" />
        <EmptyState
          title="Sin elementos todavía"
          description="Ejemplo real de estado vacío."
          action={<Button>Crear el primero</Button>}
        />
        <ErrorState title="No se pudo cargar" technicalDetail="Detalle técnico real de ejemplo." />
        <Skeleton variant="block" height="48px" />
        <InlineAlert tone="info" title="Aviso informativo">
          Ejemplo real de InlineAlert.
        </InlineAlert>
      </section>

      <section className="dwm-showcase__section">
        <SectionHeader title="FilterBar" />
        <FilterBar searchValue={search} onSearchChange={setSearch} searchLabel="Buscar" />
      </section>

      <section className="dwm-showcase__section">
        <SectionHeader title="Tabs" />
        <Tabs
          items={[
            { id: "a", label: "Pestaña A", content: <p>Contenido A</p> },
            { id: "b", label: "Pestaña B", content: <p>Contenido B</p> },
          ]}
        />
      </section>

      <section className="dwm-showcase__section">
        <SectionHeader title="FormSection" />
        <FormSection title="Datos reales" description="Agrupación de campos.">
          <TextField label="Nombre" value="" onChange={() => {}} />
        </FormSection>
      </section>

      <section className="dwm-showcase__section">
        <SectionHeader title="ConfirmDialog / PreviewDialog" />
        <div className="dwm-showcase__grid">
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Abrir ConfirmDialog
          </Button>
          <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
            Abrir PreviewDialog
          </Button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title="Confirmación real"
          description="Ejemplo de ConfirmDialog."
          confirmLabel="Confirmar"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
        />
        <PreviewDialog
          open={previewOpen}
          title="Preview real"
          onClose={() => setPreviewOpen(false)}
          onConfirm={() => setPreviewOpen(false)}
        >
          <p>Contenido de ejemplo del PreviewDialog.</p>
        </PreviewDialog>
      </section>
    </div>
  );
}
