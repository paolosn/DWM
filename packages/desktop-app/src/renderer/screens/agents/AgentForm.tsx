import { useState } from "react";
import type { AgentData } from "@dwm/agent-manager";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import "./AgentForm.css";

export interface AgentFormValues {
  readonly id: string;
  readonly data: AgentData;
}

export interface AgentFormProps {
  readonly submitting: boolean;
  readonly onSubmit: (values: AgentFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
}

/**
 * Módulo 33A — Formulario específico de Agentes. `Agent.data` es un
 * `Record<string, unknown>` libre (no un esquema fijo — así lo define
 * `@dwm/agent-manager`), así que se edita como JSON explícito en vez de
 * inventar campos que el backend no reconoce.
 */
export function AgentForm({ submitting, onSubmit, onCancel }: AgentFormProps): JSX.Element {
  const [id, setId] = useState("");
  const [dataText, setDataText] = useState('{\n  "name": ""\n}');
  const [idError, setIdError] = useState<string | undefined>(undefined);
  const [dataError, setDataError] = useState<string | undefined>(undefined);

  function handleSubmit(): void {
    let hasError = false;
    if (!id.trim()) {
      setIdError("El identificador es obligatorio.");
      hasError = true;
    } else {
      setIdError(undefined);
    }
    let parsed: AgentData | undefined;
    try {
      parsed = JSON.parse(dataText) as AgentData;
      setDataError(undefined);
    } catch {
      setDataError("El JSON no es válido.");
      hasError = true;
    }
    if (hasError || !parsed) return;
    void onSubmit({ id: id.trim(), data: parsed });
  }

  return (
    <div className="dwm-agent-form">
      <TextField
        label="Identificador"
        value={id}
        onChange={(e) => setId(e.target.value)}
        {...(idError ? { error: idError } : {})}
        required
      />
      <TextArea
        label="Datos (JSON)"
        rows={10}
        value={dataText}
        onChange={(e) => setDataText(e.target.value)}
        {...(dataError
          ? { error: dataError }
          : { hint: "Estructura libre: la interpreta el propio agente." })}
      />
      <div className="dwm-agent-form__footer">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          Crear agente
        </Button>
      </div>
    </div>
  );
}
