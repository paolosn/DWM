import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";
import "./Select.css";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  readonly label: string;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly error?: string;
  readonly hint?: string;
}

/**
 * Módulo 33A — Design System. Selección de una opción entre una lista
 * cerrada y corta. Para listas largas con búsqueda se usa `Combobox`.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, placeholder, error, hint, id, required, disabled, className, ...rest },
  ref
): ReactNode {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={["dwm-select", className].filter(Boolean).join(" ")}>
      <label htmlFor={fieldId} className="dwm-select__label">
        {label}
        {required && (
          <span aria-hidden="true" className="dwm-select__required">
            {" "}
            *
          </span>
        )}
      </label>
      <select
        ref={ref}
        id={fieldId}
        className="dwm-select__input"
        data-invalid={Boolean(error) || undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        required={required}
        disabled={disabled}
        {...(rest.value === undefined
          ? { defaultValue: rest.defaultValue ?? (placeholder ? "" : undefined) }
          : {})}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error && (
        <p id={hintId} className="dwm-select__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="dwm-select__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
