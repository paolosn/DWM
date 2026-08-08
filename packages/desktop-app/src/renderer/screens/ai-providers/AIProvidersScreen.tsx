import { useState } from "react";
import { callOperation, DwmOperationError, useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
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
import "./AIProvidersScreen.css";

export interface AIProviderView {
  readonly id: string;
  readonly name: string;
  readonly format: "openai" | "anthropic";
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
  readonly format: "openai" | "anthropic";
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
      <PageHeader
        title="IA y modelos"
        description="Proveedores de IA reales configurados en este Workspace."
        actions={<Button onClick={openCreate}>Añadir proveedor</Button>}
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
                setForm({ ...form, format: e.target.value as "openai" | "anthropic" })
              }
              options={[
                {
                  value: "openai",
                  label: "OpenAI compatible (OpenAI, OpenRouter, Ollama, LM Studio…)",
                },
                { value: "anthropic", label: "Anthropic" },
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
