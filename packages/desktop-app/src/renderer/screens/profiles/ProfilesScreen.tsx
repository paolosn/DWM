import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { callOperation, useDwmQuery, DwmOperationError } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { FilterBar } from "../../design-system/composites/FilterBar/index.js";
import { DataList } from "../../design-system/composites/DataList/index.js";
import { EntityCard } from "../../design-system/composites/EntityCard/index.js";
import { SectionHeader } from "../../design-system/composites/SectionHeader/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { Drawer } from "../../design-system/composites/Drawer/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { ProfileForm, type ProfileFormValues } from "./ProfileForm.js";
import "./ProfilesScreen.css";

interface ProfileSyncItem {
  readonly kind: "agent" | "skill" | "rule";
  readonly id: string;
  readonly preview: {
    readonly action: "create" | "update" | "unchanged" | "conflict";
    readonly reason?: string;
  };
}
interface ProfilePreview {
  readonly items: readonly ProfileSyncItem[];
  readonly hasConflicts: boolean;
}
interface ProjectOption {
  readonly id: string;
  readonly name: string;
}
interface ProfileCardData {
  readonly name: string;
  readonly description: string;
  readonly color?: string;
  readonly agentCount: number;
  readonly skillCount: number;
  readonly ruleCount: number;
  readonly hasAi: boolean;
  readonly mcpCount: number;
}

const ACTION_LABEL: Record<ProfileSyncItem["preview"]["action"], string> = {
  create: "Se creará",
  update: "Se actualizará",
  unchanged: "Sin cambios",
  conflict: "Conflicto",
};

/**
 * Perfiles — el kit de trabajo completo, ya no una configuración
 * técnica: crear/editar visualmente (`ProfileForm`), aplicar con
 * preview real, conflictos y confirmación explícita (reutilizando
 * exclusivamente `profile-sync.preview`/`profile-sync.apply`, que a su
 * vez delegan en `ProfileSyncService` — ningún mecanismo nuevo), y ver
 * "Aplicado actualmente en" con los proyectos reales.
 */
export function ProfilesScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProfileFormValues | undefined>(undefined);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [applyTargetProjectId, setApplyTargetProjectId] = useState("");
  const [applyPreview, setApplyPreview] = useState<ProfilePreview | undefined>(undefined);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | undefined>(undefined);

  const [projectOptions, setProjectOptions] = useState<readonly ProjectOption[]>([]);
  const [appliedIn, setAppliedIn] = useState<readonly ProjectOption[] | undefined>(undefined);
  const [appliedCountByProfileId, setAppliedCountByProfileId] = useState<Record<string, number>>(
    {}
  );
  const [cardDataById, setCardDataById] = useState<Record<string, ProfileCardData>>({});

  const { showToast } = useToast();

  const listQuery = useDwmQuery("profiles.list", {});
  const detailQuery = useDwmQuery(
    "profiles.get",
    { id: detailId ?? "" },
    { enabled: Boolean(detailId) }
  );

  useEffect(() => {
    void (async () => {
      try {
        const ids = (await callOperation("projects.list" as never, {} as never)) as string[];
        const details = await Promise.all(
          ids.map((id) =>
            callOperation("projects.get" as never, { id } as never).catch(() => undefined)
          )
        );
        const realProjects = details.filter(Boolean) as {
          id: string;
          metadata: { name: string };
          configuration: { profileId: string };
        }[];
        setProjectOptions(realProjects.map((p) => ({ id: p.id, name: p.metadata.name })));
        const counts: Record<string, number> = {};
        for (const p of realProjects) {
          counts[p.configuration.profileId] = (counts[p.configuration.profileId] ?? 0) + 1;
        }
        setAppliedCountByProfileId(counts);
      } catch {
        setProjectOptions([]);
        setAppliedCountByProfileId({});
      }
    })();
  }, []);

  useEffect(() => {
    if (listQuery.status !== "success" || !listQuery.data) return;
    void (async () => {
      const entries = await Promise.all(
        listQuery.data!.map(async (id) => {
          const profile = await callOperation("profiles.get" as never, { id } as never).catch(
            () => undefined
          );
          return [id, profile] as const;
        })
      );
      const map: Record<string, ProfileCardData> = {};
      for (const [id, profile] of entries) {
        const p = profile as
          | {
              metadata: { name: string; description: string };
              configuration: {
                color?: string;
                agentIds?: readonly string[];
                skillIds?: readonly string[];
                ruleIds?: readonly string[];
                defaultAIProviderId?: string;
                mcpConnectionIds?: readonly string[];
              };
            }
          | undefined;
        if (!p) continue;
        map[id] = {
          name: p.metadata.name,
          description: p.metadata.description,
          ...(p.configuration.color ? { color: p.configuration.color } : {}),
          agentCount: (p.configuration.agentIds ?? []).length,
          skillCount: (p.configuration.skillIds ?? []).length,
          ruleCount: (p.configuration.ruleIds ?? []).length,
          hasAi: Boolean(p.configuration.defaultAIProviderId),
          mcpCount: (p.configuration.mcpConnectionIds ?? []).length,
        };
      }
      setCardDataById(map);
    })();
  }, [listQuery.status, listQuery.data]);

  useEffect(() => {
    if (!detailId) {
      setAppliedIn(undefined);
      return;
    }
    void (async () => {
      try {
        const ids = (await callOperation("projects.list" as never, {} as never)) as string[];
        const details = await Promise.all(
          ids.map((id) =>
            callOperation("projects.get" as never, { id } as never).catch(() => undefined)
          )
        );
        setAppliedIn(
          (
            details.filter(Boolean) as {
              id: string;
              metadata: { name: string };
              configuration: { profileId: string };
            }[]
          )
            .filter((p) => p.configuration.profileId === detailId)
            .map((p) => ({ id: p.id, name: p.metadata.name }))
        );
      } catch {
        setAppliedIn([]);
      }
    })();
  }, [detailId]);

  const filtered = useMemo(() => {
    const ids = listQuery.data ?? [];
    const normalized = search.trim().toLowerCase();
    if (!normalized) return ids;
    return ids.filter((id) => id.toLowerCase().includes(normalized));
  }, [listQuery.data, search]);

  async function handleCreate(values: ProfileFormValues): Promise<void> {
    setFormSubmitting(true);
    try {
      await callOperation("profiles.create" as never, values as never);
      showToast({ title: `Perfil «${values.name}» creado`, tone: "success" });
      setCreating(false);
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo crear el perfil",
        tone: "danger",
      });
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleEditSubmit(values: ProfileFormValues): Promise<void> {
    if (!editing || !detailId) return;
    setFormSubmitting(true);
    try {
      await callOperation("profiles.update" as never, { id: detailId, ...values } as never);
      showToast({ title: `Perfil «${values.name}» actualizado`, tone: "success" });
      setEditing(undefined);
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo actualizar el perfil",
        tone: "danger",
      });
    } finally {
      setFormSubmitting(false);
    }
  }

  async function openEdit(): Promise<void> {
    if (!detailQuery.data) return;
    const p = detailQuery.data;
    setEditing({
      name: p.metadata.name,
      description: p.metadata.description,
      configuration: p.configuration as ProfileFormValues["configuration"],
    });
  }

  async function handlePreviewApply(): Promise<void> {
    if (!detailId || !applyTargetProjectId) return;
    setApplyLoading(true);
    setApplyError(undefined);
    try {
      const preview = (await callOperation(
        "profile-sync.preview" as never,
        {
          profileId: detailId,
          targetProjectId: applyTargetProjectId,
        } as never
      )) as ProfilePreview;
      setApplyPreview(preview);
    } catch (err) {
      setApplyError(
        err instanceof DwmOperationError ? err.message : "No se pudo previsualizar la aplicación."
      );
    } finally {
      setApplyLoading(false);
    }
  }

  async function handleConfirmApply(confirmOverwrite: boolean): Promise<void> {
    if (!detailId || !applyTargetProjectId) return;
    setApplyLoading(true);
    setApplyError(undefined);
    try {
      await callOperation(
        "profile-sync.apply" as never,
        {
          profileId: detailId,
          targetProjectId: applyTargetProjectId,
          ...(confirmOverwrite ? { confirmOverwrite: true } : {}),
        } as never
      );
      showToast({ title: "Perfil aplicado correctamente", tone: "success" });
      setApplyPreview(undefined);
      setApplyTargetProjectId("");
      setDetailId(detailId); // fuerza refresco de "Aplicado actualmente en"
    } catch (err) {
      setApplyError(
        err instanceof DwmOperationError
          ? err.message
          : "No se pudo aplicar el perfil (se revirtió)."
      );
    } finally {
      setApplyLoading(false);
    }
  }

  return (
    <div className="dwm-profiles-screen">
      <PageHeader
        title="Perfiles"
        description="Kits de trabajo completos: agentes, skills, reglas, IA y MCP listos para aplicar a un proyecto."
      />
      <FilterBar searchValue={search} onSearchChange={setSearch} searchLabel="Buscar perfiles" />
      <div className="dwm-profiles-screen__toolbar">
        <Button onClick={() => setCreating(true)}>Crear perfil</Button>
      </div>

      {(listQuery.status === "idle" || listQuery.status === "loading") && (
        <Skeleton variant="block" height="120px" />
      )}
      {listQuery.status === "error" && (
        <ErrorState
          title="No se pudieron cargar los perfiles"
          {...(listQuery.error?.message ? { technicalDetail: listQuery.error.message } : {})}
        />
      )}
      {listQuery.status === "success" && filtered.length === 0 && (
        <EmptyState
          title={
            search
              ? "Sin perfiles que coincidan con la búsqueda"
              : "Sin perfiles disponibles todavía"
          }
        />
      )}
      {listQuery.status === "success" && filtered.length > 0 && (
        <DataList
          ariaLabel="Perfiles"
          items={filtered}
          getItemId={(id) => id}
          renderItem={(id) => {
            const card = cardDataById[id];
            const appliedCount = appliedCountByProfileId[id] ?? 0;
            return (
              <div
                className="dwm-profiles-screen__card-wrap"
                style={
                  card?.color ? ({ "--dwm-profile-color": card.color } as CSSProperties) : undefined
                }
              >
                <EntityCard
                  name={card?.name ?? id}
                  description={card?.description || "Sin descripción."}
                  onClick={() => setDetailId(id)}
                  {...(card
                    ? {
                        stats: [
                          { label: "Agentes", value: card.agentCount },
                          { label: "Skills", value: card.skillCount },
                          { label: "Reglas", value: card.ruleCount },
                          { label: "MCP", value: card.mcpCount },
                        ],
                      }
                    : {})}
                  status={
                    card ? (
                      <div className="dwm-profiles-screen__card-summary">
                        <StatusBadge
                          label={card.hasAi ? "IA configurada" : "Sin IA"}
                          tone={card.hasAi ? "success" : "neutral"}
                        />
                        <StatusBadge
                          label={
                            appliedCount > 0
                              ? `Aplicado en ${appliedCount} proyecto${appliedCount === 1 ? "" : "s"}`
                              : "Sin aplicar todavía"
                          }
                          tone={appliedCount > 0 ? "accent" : "neutral"}
                        />
                      </div>
                    ) : undefined
                  }
                  primaryActions={
                    <Button variant="secondary" onClick={() => setDetailId(id)}>
                      Ver detalle
                    </Button>
                  }
                />
              </div>
            );
          }}
        />
      )}

      <Drawer open={creating} title="Crear perfil" onClose={() => setCreating(false)}>
        <ProfileForm
          submitting={formSubmitting}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      </Drawer>

      <Drawer
        open={detailId !== undefined && !editing}
        title={detailId ? `Perfil: ${detailId}` : ""}
        onClose={() => {
          setDetailId(undefined);
          setApplyPreview(undefined);
          setApplyTargetProjectId("");
        }}
      >
        {detailQuery.status === "loading" && <Skeleton variant="block" height="100px" />}
        {detailQuery.status === "error" && (
          <ErrorState
            title="No se pudo cargar el detalle del perfil"
            {...(detailQuery.error?.message ? { technicalDetail: detailQuery.error.message } : {})}
          />
        )}
        {detailQuery.status === "success" && !detailQuery.data && (
          <EmptyState title="Perfil no encontrado" />
        )}
        {detailQuery.status === "success" && detailQuery.data && (
          <div className="dwm-profiles-screen__detail">
            <dl className="dwm-profiles-screen__facts">
              <dt>Nombre</dt>
              <dd>{detailQuery.data.metadata.name}</dd>
              <dt>Descripción</dt>
              <dd>{detailQuery.data.metadata.description || "—"}</dd>
              <dt>Resumen del kit</dt>
              <dd>
                {(detailQuery.data.configuration.agentIds ?? []).length} agentes ·{" "}
                {(detailQuery.data.configuration.skillIds ?? []).length} skills ·{" "}
                {(detailQuery.data.configuration.ruleIds ?? []).length} reglas ·{" "}
                {detailQuery.data.configuration.defaultAIProviderId
                  ? "IA configurada"
                  : "sin IA configurada"}{" "}
                · {(detailQuery.data.configuration.mcpConnectionIds ?? []).length} MCP configurados
              </dd>
            </dl>

            <Button variant="secondary" onClick={() => void openEdit()}>
              Editar kit
            </Button>

            <section className="dwm-profiles-screen__apply">
              <SectionHeader title="Aplicar a un proyecto" />
              <Select
                label="Proyecto destino"
                placeholder="Elige un proyecto"
                options={projectOptions.map((p) => ({ value: p.id, label: p.name }))}
                value={applyTargetProjectId}
                onChange={(e) => {
                  setApplyTargetProjectId(e.target.value);
                  setApplyPreview(undefined);
                }}
              />
              <Button
                variant="secondary"
                onClick={() => void handlePreviewApply()}
                loading={applyLoading}
                disabled={!applyTargetProjectId}
              >
                Previsualizar
              </Button>

              {applyError && (
                <ErrorState title="No se pudo aplicar el perfil" technicalDetail={applyError} />
              )}

              {applyPreview && (
                <div className="dwm-profiles-screen__preview">
                  <ul>
                    {applyPreview.items.map((item) => (
                      <li key={`${item.kind}-${item.id}`}>
                        <StatusBadge
                          label={`${item.kind}: ${item.id} — ${ACTION_LABEL[item.preview.action]}`}
                          tone={
                            item.preview.action === "conflict"
                              ? "warning"
                              : item.preview.action === "unchanged"
                                ? "neutral"
                                : "success"
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  {applyPreview.hasConflicts ? (
                    <InlineAlert tone="warning" title="Hay conflictos reales">
                      Algún elemento ya existe en el proyecto con contenido distinto. Sobrescribirlo
                      requiere confirmación explícita.
                    </InlineAlert>
                  ) : null}
                  <Button
                    onClick={() => void handleConfirmApply(applyPreview.hasConflicts)}
                    loading={applyLoading}
                  >
                    {applyPreview.hasConflicts ? "Confirmar y sobrescribir" : "Aplicar perfil"}
                  </Button>
                </div>
              )}
            </section>

            <section className="dwm-profiles-screen__applied-in">
              <SectionHeader title="Aplicado actualmente en" />
              {appliedIn === undefined && <Skeleton variant="block" height="60px" />}
              {appliedIn !== undefined && appliedIn.length === 0 && (
                <EmptyState title="Este perfil todavía no está aplicado en ningún proyecto." />
              )}
              {appliedIn !== undefined && appliedIn.length > 0 && (
                <ul>
                  {appliedIn.map((project) => (
                    <li key={project.id} className="dwm-profiles-screen__applied-row">
                      <span>{project.name}</span>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          void callOperation("projects.open-in-vscode", { id: project.id })
                        }
                      >
                        Abrir proyecto
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>

      <Drawer
        open={editing !== undefined}
        title={editing ? `Editar kit: ${editing.name}` : ""}
        onClose={() => setEditing(undefined)}
      >
        {editing && (
          <ProfileForm
            submitting={formSubmitting}
            initial={editing}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditing(undefined)}
          />
        )}
      </Drawer>
    </div>
  );
}
