import { TextField } from "../../../design-system/primitives/TextField/index.js";
import { SecretField } from "../../../design-system/primitives/SecretField/index.js";
import { IconButton } from "../../../design-system/primitives/IconButton/index.js";
import "./KeyValueListEditor.css";

export interface KeyValuePair {
  readonly key: string;
  readonly value: string;
}

export interface KeyValueListEditorProps {
  readonly label: string;
  readonly hint?: string;
  readonly pairs: readonly KeyValuePair[];
  readonly onChange: (pairs: KeyValuePair[]) => void;
  /** Usa `SecretField` (oculto por defecto) en vez de `TextField` para el valor. */
  readonly secret?: boolean;
  readonly addLabel?: string;
}

/**
 * Editor genérico de pares clave/valor para la configuración segura
 * (`config`) y los secretos (`secrets`) de una conexión. No es parte del
 * Design System (es específico de este formulario), pero se construye
 * exclusivamente a partir de sus primitivas (`TextField`, `SecretField`,
 * `IconButton`), sin estilos ni comportamiento propios de accesibilidad.
 */
export function KeyValueListEditor({
  label,
  hint,
  pairs,
  onChange,
  secret = false,
  addLabel = "Añadir",
}: KeyValueListEditorProps): JSX.Element {
  function updateAt(index: number, next: Partial<KeyValuePair>): void {
    onChange(pairs.map((pair, i) => (i === index ? { ...pair, ...next } : pair)));
  }

  function removeAt(index: number): void {
    onChange(pairs.filter((_, i) => i !== index));
  }

  return (
    <fieldset className="dwm-kv-editor">
      <legend className="dwm-kv-editor__legend">{label}</legend>
      {hint && <p className="dwm-kv-editor__hint">{hint}</p>}
      {pairs.map((pair, index) => (
        <div className="dwm-kv-editor__row" key={index}>
          <TextField
            label="Clave"
            aria-label={`Clave ${index + 1}`}
            value={pair.key}
            onChange={(e) => updateAt(index, { key: e.target.value })}
            placeholder="p. ej. url"
          />
          {secret ? (
            <SecretField
              label="Valor"
              aria-label={`Valor ${index + 1}`}
              value={pair.value}
              onChange={(e) => updateAt(index, { value: e.target.value })}
              placeholder="Nuevo valor"
            />
          ) : (
            <TextField
              label="Valor"
              aria-label={`Valor ${index + 1}`}
              value={pair.value}
              onChange={(e) => updateAt(index, { value: e.target.value })}
            />
          )}
          <IconButton
            label={`Eliminar fila ${index + 1}`}
            icon="✕"
            onClick={() => removeAt(index)}
          />
        </div>
      ))}
      <button
        type="button"
        className="dwm-kv-editor__add"
        onClick={() => onChange([...pairs, { key: "", value: "" }])}
      >
        + {addLabel}
      </button>
    </fieldset>
  );
}
