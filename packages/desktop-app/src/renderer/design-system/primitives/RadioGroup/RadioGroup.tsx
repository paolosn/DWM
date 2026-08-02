import { useId } from "react";
import "./RadioGroup.css";

export interface RadioOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface RadioGroupProps {
  readonly label: string;
  readonly name?: string;
  readonly options: readonly RadioOption[];
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}

/**
 * Módulo 33A — Design System. Grupo de opciones exclusivas con
 * `role="radiogroup"` y etiqueta agrupadora accesible.
 */
export function RadioGroup({
  label,
  name,
  options,
  value,
  onChange,
  error,
  disabled = false,
}: RadioGroupProps): JSX.Element {
  const generatedName = useId();
  const groupName = name ?? generatedName;
  const errorId = error ? `${groupName}-error` : undefined;

  return (
    <fieldset className="dwm-radio-group" disabled={disabled}>
      <legend className="dwm-radio-group__label">{label}</legend>
      <div
        role="radiogroup"
        aria-label={label}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={errorId}
      >
        {options.map((option) => (
          <label key={option.value} className="dwm-radio-group__option">
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={value === option.value}
              disabled={disabled || option.disabled}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="dwm-radio-group__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
