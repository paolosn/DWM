import { useEffect, useState } from "react";
import { callOperation, DwmOperationError, useDwmQuery } from "../../api-client/index.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { CatalogPicker, type CatalogPickerEntry } from "./CatalogPicker.js";
import "./ProfileForm.css";

export interface ProfileConfigurationDraft {
  readonly enabledTools: readonly string[];
  readonly enabledAdapters: readonly string[];
  readonly secretRefs: readonly string[];
  readonly color?: string;
  readonly sourceClientId?: string;
  readonly defaultAIProviderId?: string;
  readonly aiProviderConfiguration?: Readonly<Record<string, unknown>>;
  readonly agentIds?: readonly string[];
  readonly skillIds?: readonly string[];
  readonly ruleIds?: readonly string[];
  readonly mcpConnectionIds?: readonly string[];
}

export interface ProfileFormValues {
  readonly name: string;
  readonly description: string;
  readonly configuration: ProfileConfigurationDraft;
}

export interface ProfileFormProps {
  readonly submitting: boolean;
  readonly onSubmit: (values: ProfileFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
  readonly initial?: ProfileFormValues;
}

interface ClientOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Perfiles — el "kit de trabajo" completo: nombre, descripción, color,
 * IA (proveedor/modelo/fallback), MCP y Agentes/Skills/Reglas
 * seleccionados visualmente de los catálogos reales ya existentes
 * (nunca escribiendo un id a mano). El origen del catálogo (global o
 * un cliente concreto) es el mismo `sourceClientId` real que después
 * usa `ProfileSyncController` para resolver de dónde sincronizar.
 */
export function ProfileForm({
  submitting,
  onSubmit,
  onCancel,
  initial,
}: ProfileFormProps): JSX.Element {
  const { setActiveSection } = useNavigation();
  const aiProvidersQuery = useDwmQuery("ai.list-providers", {});
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.configuration.color ?? "#4f46e5");
  const [sourceScope, setSourceScope] = useState<"global" | "client">(
    initial?.configuration.sourceClientId ? "client" : "global"
  );
  const [sourceClientId, setSourceClientId] = useState(initial?.configuration.sourceClientId ?? "");
  const [aiProvider, setAiProvider] = useState(initial?.configuration.defaultAIProviderId ?? "");
  const [aiModel, setAiModel] = useState(
    (initial?.configuration.aiProviderConfiguration?.["model"] as string | undefined) ?? ""
  );
  const [aiFallback, setAiFallback] = useState(
    (initial?.configuration.aiProviderConfiguration?.["fallbackModel"] as string | undefined) ?? ""
  );

  const [agentIds, setAgentIds] = useState<readonly string[]>(
    initial?.configuration.agentIds ?? []
  );
  const [skillIds, setSkillIds] = useState<readonly string[]>(
    initial?.configuration.skillIds ?? []
  );
  const [ruleIds, setRuleIds] = useState<readonly string[]>(initial?.configuration.ruleIds ?? []);
  const [mcpConnectionIds, setMcpConnectionIds] = useState<readonly string[]>(
    initial?.configuration.mcpConnectionIds ?? []
  );

  const [clientOptions, setClientOptions] = useState<readonly ClientOption[]>([]);
  const [agentEntries, setAgentEntries] = useState<readonly CatalogPickerEntry[]>([]);
  const [skillEntries, setSkillEntries] = useState<readonly CatalogPickerEntry[]>([]);
  const [ruleEntries, setRuleEntries] = useState<readonly CatalogPickerEntry[]>([]);
  const [mcpEntries, setMcpEntries] = useState<readonly CatalogPickerEntry[]>([]);
  const [catalogError, setCatalogError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void callOperation("clients.list" as never, {} as never)
      .then((result) => {
        const list = result as { id: string; name?: string }[];
        setClientOptions(list.map((c) => ({ id: c.id, name: c.name ?? c.id })));
      })
      .catch(() => setClientOptions([]));
  }, []);

  useEffect(() => {
    if (sourceScope === "client" && !sourceClientId) {
      setAgentEntries([]);
      setSkillEntries([]);
      setRuleEntries([]);
      setMcpEntries([]);
      return;
    }
    setCatalogError(undefined);
    void (async () => {
      try {
        const scopePayload = sourceScope === "client" ? { clientId: sourceClientId } : {};
        const root = (
          (await callOperation("content-scope.resolve-root" as never, scopePayload as never)) as {
            root: string;
          }
        ).root;
        const [agents, skills, rules] = await Promise.all([
          callOperation("agents.list" as never, { root } as never) as Promise<
            { id: string; name?: string; description?: string }[]
          >,
          callOperation("skills.list" as never, { root } as never) as Promise<
            { id: string; name?: string; description?: string }[]
          >,
          callOperation("rules.list" as never, { root } as never) as Promise<
            { id: string; name?: string; description?: string }[]
          >,
        ]);
        setAgentEntries(
          agents.map((a) => ({
            id: a.id,
            ...(a.name ? { name: a.name } : {}),
            ...(a.description ? { description: a.description } : {}),
          }))
        );
        setSkillEntries(
          skills.map((s) => ({
            id: s.id,
            ...(s.name ? { name: s.name } : {}),
            ...(s.description ? { description: s.description } : {}),
          }))
        );
        setRuleEntries(
          rules.map((r) => ({
            id: r.id,
            ...(r.name ? { name: r.name } : {}),
            ...(r.description ? { description: r.description } : {}),
          }))
        );

        if (sourceScope === "client" && sourceClientId) {
          const connections = (await callOperation(
            "connections.list-for-client" as never,
            {
              clientId: sourceClientId,
            } as never
          )) as { id: string; name: string; type: string }[];
          setMcpEntries(
            connections
              .filter((c) => c.type === "mcp-stdio" || c.type === "mcp-remote")
              .map((c) => ({ id: c.id, name: c.name }))
          );
        } else if (sourceScope === "global") {
          const connections = (await callOperation(
            "connections.list-global" as never,
            {} as never
          )) as { id: string; name: string; type: string }[];
          setMcpEntries(
            connections
              .filter((c) => c.type === "mcp-stdio" || c.type === "mcp-remote")
              .map((c) => ({ id: c.id, name: c.name }))
          );
        } else {
          setMcpEntries([]);
        }
      } catch (err) {
        setCatalogError(
          err instanceof DwmOperationError ? err.message : "No se pudieron cargar los catálogos."
        );
      }
    })();
  }, [sourceScope, sourceClientId]);

  function handleSubmit(): void {
    const configuration: ProfileConfigurationDraft = {
      enabledTools: initial?.configuration.enabledTools ?? [],
      enabledAdapters: initial?.configuration.enabledAdapters ?? [],
      secretRefs: initial?.configuration.secretRefs ?? [],
      color,
      ...(sourceScope === "client" && sourceClientId ? { sourceClientId } : {}),
      ...(aiProvider.trim() ? { defaultAIProviderId: aiProvider.trim() } : {}),
      ...(aiModel.trim() || aiFallback.trim()
        ? {
            aiProviderConfiguration: {
              ...(aiModel.trim() ? { model: aiModel.trim() } : {}),
              ...(aiFallback.trim() ? { fallbackModel: aiFallback.trim() } : {}),
            },
          }
        : {}),
      agentIds,
      skillIds,
      ruleIds,
      mcpConnectionIds,
    };
    void onSubmit({ name: name.trim(), description: description.trim(), configuration });
  }

  return (
    <div className="dwm-profile-form">
      <TextField
        label="Nombre del perfil"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <TextArea
        label="Descripción"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <TextField
        label="Color"
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
      />

      <Select
        label="Origen del catálogo"
        options={[
          { value: "global", label: "Global" },
          { value: "client", label: "Cliente" },
        ]}
        value={sourceScope}
        onChange={(e) => setSourceScope(e.target.value as "global" | "client")}
      />
      {sourceScope === "client" && (
        <Select
          label="Cliente"
          placeholder="Elige un cliente"
          options={clientOptions.map((c) => ({ value: c.id, label: c.name }))}
          value={sourceClientId}
          onChange={(e) => setSourceClientId(e.target.value)}
        />
      )}

      <div className="dwm-profile-form__ai">
        {aiProvidersQuery.status === "success" && (aiProvidersQuery.data ?? []).length === 0 && (
          <EmptyState
            title="No hay proveedores de IA configurados"
            action={
              <Button variant="secondary" onClick={() => setActiveSection("ai")}>
                Configurar IA
              </Button>
            }
          />
        )}
        {aiProvidersQuery.status === "success" && (aiProvidersQuery.data ?? []).length > 0 && (
          <>
            <Select
              label="Proveedor"
              placeholder="Elige un proveedor de IA"
              options={(aiProvidersQuery.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
              value={aiProvider}
              onChange={(e) => {
                const nextProvider = (aiProvidersQuery.data ?? []).find(
                  (p) => p.id === e.target.value
                );
                setAiProvider(e.target.value);
                setAiModel(nextProvider?.model ?? "");
                setAiFallback("");
              }}
            />
            {aiProvider && (
              <>
                <Select
                  label="Modelo"
                  options={(() => {
                    const selected = (aiProvidersQuery.data ?? []).find((p) => p.id === aiProvider);
                    const opts = [{ value: selected?.model ?? "", label: selected?.model ?? "" }];
                    if (selected?.fallbackModel) {
                      opts.push({ value: selected.fallbackModel, label: selected.fallbackModel });
                    }
                    return opts;
                  })()}
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                />
                {(() => {
                  const selected = (aiProvidersQuery.data ?? []).find((p) => p.id === aiProvider);
                  return selected?.fallbackModel ? (
                    <Select
                      label="Modelo de reserva (fallback)"
                      placeholder="Sin fallback"
                      options={[{ value: selected.fallbackModel, label: selected.fallbackModel }]}
                      value={aiFallback}
                      onChange={(e) => setAiFallback(e.target.value)}
                    />
                  ) : null;
                })()}
              </>
            )}
          </>
        )}
      </div>

      {catalogError && (
        <ErrorState title="No se pudieron cargar los catálogos" technicalDetail={catalogError} />
      )}
      {sourceScope === "client" && !sourceClientId && (
        <InlineAlert tone="info" title="Elige un cliente">
          Elige un cliente para ver sus agentes, skills, reglas y conexiones MCP reales.
        </InlineAlert>
      )}

      <CatalogPicker
        label="Agentes"
        entries={agentEntries}
        selectedIds={agentIds}
        onChange={setAgentIds}
        emptyMessage="Sin agentes disponibles en este alcance."
      />
      <CatalogPicker
        label="Skills"
        entries={skillEntries}
        selectedIds={skillIds}
        onChange={setSkillIds}
        emptyMessage="Sin skills disponibles en este alcance."
      />
      <CatalogPicker
        label="Reglas"
        entries={ruleEntries}
        selectedIds={ruleIds}
        onChange={setRuleIds}
        emptyMessage="Sin reglas disponibles en este alcance."
      />
      <CatalogPicker
        label="MCP existentes"
        entries={mcpEntries}
        selectedIds={mcpConnectionIds}
        onChange={setMcpConnectionIds}
        emptyMessage={
          sourceScope === "client"
            ? "Este cliente no tiene conexiones MCP configuradas."
            : "El MCP existente solo puede elegirse con un cliente como origen."
        }
      />

      <div className="dwm-profile-form__summary">
        <strong>Resumen del kit</strong>
        <p>
          {agentIds.length} agentes · {skillIds.length} skills · {ruleIds.length} reglas ·{" "}
          {aiProvider.trim() ? "IA configurada" : "sin IA configurada"} · {mcpConnectionIds.length}{" "}
          MCP configurados
        </p>
      </div>

      <div className="dwm-profile-form__footer">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={submitting} disabled={!name.trim()}>
          {initial ? "Guardar cambios" : "Crear perfil"}
        </Button>
      </div>
    </div>
  );
}
