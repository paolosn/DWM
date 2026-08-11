import { useState } from "react";
import { callOperation, DwmOperationError, useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { SectionHeader } from "../../design-system/composites/SectionHeader/index.js";
import { ResourceCard } from "../../design-system/composites/ResourceCard/index.js";
import { StatusBadge, STATUS_PRESETS } from "../../design-system/primitives/StatusBadge/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { Drawer } from "../../design-system/composites/Drawer/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { Switch } from "../../design-system/primitives/Switch/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { EffectiveAiModel } from "./EffectiveAiModel.js";
import "./AIProvidersScreen.css";

/**
 * fix/library-edit-and-simple-ai (Objetivo 2) — mapeo interno real de
 * los 4 proveedores simples a la arquitectura ya existente
 * (HttpAIProvider solo necesita format+baseUrl+model, ya soporta
 * cualquier endpoint compatible con OpenAI o Anthropic). El usuario
 * nunca ve baseUrl/format/model: solo elige un botón y pega su API
 * key. Endpoints oficiales reales, sin URLs inventadas:
 * - Claude -> Anthropic Messages API real.
 * - ChatGPT -> OpenAI Chat Completions real.
 * - Gemini -> endpoint oficial de Google compatible con OpenAI
 *   (generativelanguage.googleapis.com/v1beta/openai), mismo formato
 *   "openai" ya soportado -- no hace falta un tercer formato.
 * - DeepSeek -> endpoint oficial DeepSeek, compatible con OpenAI.
 */
type SimpleProviderKey = "claude" | "chatgpt" | "gemini" | "deepseek";

interface SimpleProviderDef {
  readonly key: SimpleProviderKey;
  readonly label: string;
  readonly format: "openai" | "anthropic" | "gemini";
  readonly baseUrl: string;
  readonly model: string;
}

const SIMPLE_PROVIDERS: readonly SimpleProviderDef[] = [
  {
    key: "claude",
    label: "Claude",
    format: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-5-sonnet-20241022",
  },
  {
    key: "chatgpt",
    label: "ChatGPT",
    format: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
  },
  {
    key: "gemini",
    label: "Gemini",
    format: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.0-flash",
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    format: "openai",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
];

export interface AIProviderView {
  readonly id: string;
  readonly name: string;
  readonly format: "openai" | "anthropic" | "gemini";
  readonly baseUrl: string;
  readonly model: string;
  readonly fallbackModel?: string;
  readonly isDefault: boolean;
  readonly hasCredential: boolean;
  readonly connectionStatus: "disconnected" | "connecting" | "connected" | "error";
}

interface FormState {
  readonly id: string;
  readonly name: string;
  readonly format: "openai" | "anthropic" | "gemini";
  readonly baseUrl: string;
  readonly model: string;
  readonly fallbackModel: string;
  readonly apiKey: string;
  readonly setDefault: boolean;
}

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  format: "openai",
  baseUrl: "",
  model: "",
  fallbackModel: "",
  apiKey: "",
  setDefault: false,
};

const connectionStatusPreset = {
  connected: STATUS_PRESETS.sincronizado,
  error: STATUS_PRESETS.error,
  connecting: STATUS_PRESETS.pendiente,
  disconnected: STATUS_PRESETS.archivado,
} as const;

/**
 * client-workflow-v2 (cierre de bloqueos funcionales, objetivo 1) —
 * gestión real de proveedores de IA: listar/añadir/editar/eliminar/
 * probar conexión/marcar predeterminado, todo contra las operaciones
 * reales `ai.*` (AIProviderController, delega en AIManager +
 * SecretsManager ya existentes). La API key nunca se muestra ni se
 * devuelve completa: solo "Credencial configurada: sí/no".
 */
/**
 * fix/library-edit-and-simple-ai (Objetivo 2) — panel simple: elegir
 * proveedor (Claude/ChatGPT/Gemini/DeepSeek) + pegar la API key +
 * Guardar. Establece el proveedor GLOBAL predeterminado. Reutiliza
 * exactamente las mismas operaciones reales ai.add-provider/
 * ai.update-provider/ai.delete-provider (ningún backend nuevo). La
 * key nunca se muestra ni se guarda aquí: solo se envía una vez al
 * backend, que la persiste vía SecretsManager.
 */
function SimpleAISetup({
  providers,
  onChanged,
}: {
  readonly providers: readonly AIProviderView[];
  readonly onChanged: () => void | Promise<void>;
}): JSX.Element {
  const { showToast } = useToast();
  const configured = providers.find((p) => SIMPLE_PROVIDERS.some((sp) => sp.key === p.id));
  const [selected, setSelected] = useState<SimpleProviderKey>(
    (configured?.id as SimpleProviderKey | undefined) ?? "claude"
  );
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const def = SIMPLE_PROVIDERS.find((sp) => sp.key === selected)!;
  const alreadyConfiguredForSelected = providers.find((p) => p.id === selected);

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      if (alreadyConfiguredForSelected) {
        await callOperation("ai.update-provider", {
          id: selected,
          ...(apiKey ? { apiKey } : {}),
        });
        if (!alreadyConfiguredForSelected.isDefault) {
          await callOperation("ai.set-default-provider", { id: selected });
        }
      } else {
        await callOperation("ai.add-provider", {
          id: selected,
          name: def.label,
          format: def.format,
          baseUrl: def.baseUrl,
          model: def.model,
          apiKey,
          setDefault: true,
        });
      }
      setApiKey("");
      showToast({ title: `${def.label} configurado como IA predeterminada`, tone: "success" });
      await onChanged();
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo guardar la IA",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!alreadyConfiguredForSelected) return;
    try {
      await callOperation("ai.delete-provider", { id: selected });
      showToast({ title: `${def.label} eliminado`, tone: "success" });
      setPendingDelete(false);
      await onChanged();
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo eliminar",
        tone: "danger",
      });
    }
  }

  return (
    <div className="dwm-ai-providers-screen__simple">
      <PageHeader title="IA y modelos" description="Configura tu proveedor de IA predeterminado." />
      <div
        className="dwm-ai-providers-screen__simple-buttons"
        role="radiogroup"
        aria-label="Proveedor de IA"
      >
        {SIMPLE_PROVIDERS.map((sp) => (
          <button
            key={sp.key}
            type="button"
            role="radio"
            aria-checked={selected === sp.key}
            className="dwm-ai-providers-screen__simple-button"
            data-active={selected === sp.key}
            onClick={() => setSelected(sp.key)}
          >
            {sp.label}
            {providers.find((p) => p.id === sp.key) && (
              <StatusBadge label="Configurado" tone="success" />
            )}
          </button>
        ))}
      </div>

      <TextField
        label="API Key"
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={
          alreadyConfiguredForSelected?.hasCredential ? "••••••••••••" : "Pega tu API key aquí"
        }
        {...(alreadyConfiguredForSelected?.hasCredential
          ? {
              hint: "Ya hay una clave guardada. Escribe una nueva solo si quieres reemplazarla.",
            }
          : {})}
      />

      <div className="dwm-ai-providers-screen__simple-actions">
        <Button
          onClick={() => void handleSave()}
          loading={saving}
          disabled={!apiKey && !alreadyConfiguredForSelected}
        >
          Guardar
        </Button>
        {alreadyConfiguredForSelected && (
          <Button variant="destructive" onClick={() => setPendingDelete(true)}>
            Eliminar
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete}
        title={`Eliminar ${def.label}`}
        description={`Se eliminará la configuración y la API key de ${def.label} guardada. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setPendingDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

export function AIProvidersScreen(): JSX.Element {
  const { showToast } = useToast();
  const listQuery = useDwmQuery("ai.list-providers", {});
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AIProviderView | undefined>(undefined);
  const [testingId, setTestingId] = useState<string | undefined>(undefined);
  const [testResult, setTestResult] = useState<
    { readonly id: string; readonly message: string } | undefined
  >(undefined);

  const providers = listQuery.data ?? [];

  function openCreate(): void {
    setEditingId(undefined);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(provider: AIProviderView): void {
    setEditingId(provider.id);
    setForm({
      id: provider.id,
      name: provider.name,
      format: provider.format,
      baseUrl: provider.baseUrl,
      model: provider.model,
      fallbackModel: provider.fallbackModel ?? "",
      apiKey: "",
      setDefault: provider.isDefault,
    });
    setFormOpen(true);
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      if (editingId) {
        await callOperation("ai.update-provider", {
          id: editingId,
          name: form.name,
          baseUrl: form.baseUrl,
          model: form.model,
          ...(form.fallbackModel ? { fallbackModel: form.fallbackModel } : {}),
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        });
        if (form.setDefault) {
          await callOperation("ai.set-default-provider", { id: editingId });
        }
        showToast({ title: `Proveedor «${form.name}» actualizado`, tone: "success" });
      } else {
        await callOperation("ai.add-provider", {
          id: form.id,
          name: form.name,
          format: form.format,
          baseUrl: form.baseUrl,
          model: form.model,
          ...(form.fallbackModel ? { fallbackModel: form.fallbackModel } : {}),
          apiKey: form.apiKey,
          setDefault: form.setDefault,
        });
        showToast({ title: `Proveedor «${form.name}» añadido`, tone: "success" });
      }
      setFormOpen(false);
      await listQuery.refetch();
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo guardar el proveedor",
        tone: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!pendingDelete) return;
    try {
      await callOperation("ai.delete-provider", { id: pendingDelete.id });
      showToast({ title: `Proveedor «${pendingDelete.name}» eliminado`, tone: "success" });
      setPendingDelete(undefined);
      await listQuery.refetch();
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo eliminar el proveedor",
        tone: "danger",
      });
    }
  }

  async function handleSetDefault(provider: AIProviderView): Promise<void> {
    try {
      await callOperation("ai.set-default-provider", { id: provider.id });
      showToast({
        title: `«${provider.name}» es ahora el proveedor predeterminado`,
        tone: "success",
      });
      await listQuery.refetch();
    } catch (err) {
      showToast({
        title:
          err instanceof DwmOperationError ? err.message : "No se pudo cambiar el predeterminado",
        tone: "danger",
      });
    }
  }

  async function handleTestConnection(provider: AIProviderView): Promise<void> {
    setTestingId(provider.id);
    setTestResult(undefined);
    try {
      const result = await callOperation("ai.test-connection", { id: provider.id });
      setTestResult({ id: provider.id, message: result.message });
      showToast({ title: result.message, tone: result.success ? "success" : "danger" });
    } catch (err) {
      const message =
        err instanceof DwmOperationError ? err.message : "No se pudo probar la conexión";
      setTestResult({ id: provider.id, message });
      showToast({ title: message, tone: "danger" });
    } finally {
      setTestingId(undefined);
    }
  }

  const isFormValid =
    form.name.trim().length > 0 &&
    form.baseUrl.trim().length > 0 &&
    form.model.trim().length > 0 &&
    (editingId ? true : form.id.trim().length > 0 && form.apiKey.trim().length > 0);

  return (
    <div className="dwm-ai-providers-screen">
      <SimpleAISetup providers={providers} onChanged={() => listQuery.refetch()} />

      <EffectiveAiModel />

      <SectionHeader
        title="Avanzado"
        description="Añadir otros proveedores u otros parámetros técnicos (base URL, formato, modelo de respaldo)."
        action={
          <Button variant="secondary" onClick={openCreate}>
            Añadir proveedor
          </Button>
        }
      />

      {(listQuery.status === "idle" || listQuery.status === "loading") && (
        <Skeleton variant="block" height="120px" />
      )}
      {listQuery.status === "error" && (
        <ErrorState
          title="No se pudieron cargar los proveedores de IA"
          {...(listQuery.error?.message ? { technicalDetail: listQuery.error.message } : {})}
        />
      )}
      {listQuery.status === "success" && providers.length === 0 && (
        <EmptyState
          title="No hay proveedores de IA configurados"
          description="Añade un proveedor real (OpenAI, Anthropic, OpenRouter, Ollama u otro endpoint compatible) para poder usarlo en perfiles."
          action={<Button onClick={openCreate}>Añadir proveedor</Button>}
        />
      )}
      {listQuery.status === "success" && providers.length > 0 && (
        <ul className="dwm-ai-providers-screen__list">
          {providers.map((provider) => (
            <li key={provider.id}>
              <ResourceCard
                title={provider.name}
                description={`${provider.format === "openai" ? "OpenAI compatible" : "Anthropic"} · ${provider.baseUrl} · Modelo: ${provider.model}${provider.fallbackModel ? ` (fallback: ${provider.fallbackModel})` : ""}`}
                accentColor={provider.isDefault ? "accent" : "neutral"}
                meta={
                  <div className="dwm-ai-providers-screen__badges">
                    {provider.isDefault && <StatusBadge label="Predeterminado" tone="accent" />}
                    <StatusBadge
                      label={
                        provider.hasCredential
                          ? "Credencial configurada: sí"
                          : "Credencial configurada: no"
                      }
                      tone={provider.hasCredential ? "success" : "warning"}
                    />
                    <StatusBadge {...connectionStatusPreset[provider.connectionStatus]} />
                    {testResult?.id === provider.id && (
                      <StatusBadge label={testResult.message} tone="neutral" />
                    )}
                  </div>
                }
                trailing={
                  <div className="dwm-ai-providers-screen__actions">
                    <Button
                      variant="secondary"
                      loading={testingId === provider.id}
                      onClick={() => void handleTestConnection(provider)}
                    >
                      Probar conexión
                    </Button>
                    <Button variant="secondary" onClick={() => openEdit(provider)}>
                      Editar
                    </Button>
                    {!provider.isDefault && (
                      <Button variant="secondary" onClick={() => void handleSetDefault(provider)}>
                        Marcar predeterminado
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => setPendingDelete(provider)}>
                      Eliminar
                    </Button>
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={formOpen}
        title={editingId ? "Editar proveedor de IA" : "Añadir proveedor de IA"}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              loading={submitting}
              disabled={!isFormValid}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="dwm-ai-providers-screen__form">
          {!editingId && (
            <TextField
              label="Identificador"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
              placeholder="openai-principal"
            />
          )}
          <TextField
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="OpenAI"
          />
          {!editingId && (
            <Select
              label="Formato/protocolo"
              value={form.format}
              onChange={(e) =>
                setForm({ ...form, format: e.target.value as "openai" | "anthropic" | "gemini" })
              }
              options={[
                {
                  value: "openai",
                  label: "OpenAI compatible (OpenAI, OpenRouter, Ollama, LM Studio…)",
                },
                { value: "anthropic", label: "Anthropic" },
                { value: "gemini", label: "Gemini (API nativa de Google)" },
              ]}
            />
          )}
          <TextField
            label="Base URL"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
          />
          <TextField
            label="Modelo"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="gpt-4o-mini"
          />
          <TextField
            label="Modelo de respaldo (opcional)"
            value={form.fallbackModel}
            onChange={(e) => setForm({ ...form, fallbackModel: e.target.value })}
            placeholder="gpt-4o"
          />
          <TextField
            label={
              editingId ? "Nueva API key (dejar en blanco para conservar la actual)" : "API key"
            }
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder="sk-…"
          />
          <Switch
            label="Marcar como proveedor predeterminado"
            checked={form.setDefault}
            onChange={(e) => setForm({ ...form, setDefault: e.target.checked })}
          />
        </div>
      </Drawer>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Eliminar proveedor de IA"
        description={`«${pendingDelete?.name}» y su credencial real se eliminarán permanentemente. Los perfiles que lo referencien dejarán de poder usarlo hasta que se les asigne otro.`}
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setPendingDelete(undefined)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
