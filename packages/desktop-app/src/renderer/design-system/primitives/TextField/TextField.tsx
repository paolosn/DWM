import { forwardRef, useId, type InputHTMLAttributes } from "react";
import "./TextField.css";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
}

/**
 * Módulo 33A — Design System. Campo de texto con etiqueta, ayuda y error
 * asociados vía `aria-describedby` (documento §14 "mostrar errores junto
 * al campo", §17 "etiquetas accesibles"). Es la base sobre la que el
 * framework de entidades (`EntityForm`, Fase 2) construye sus campos
 * tipados por composición.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, id, required, disabled, className, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={["dwm-text-field", className].filter(Boolean).join(" ")}>
      <label htmlFor={fieldId} className="dwm-text-field__label">
        {label}
        {required && (
          <span aria-hidden="true" className="dwm-text-field__required">
            {" "}
            *
          </span>
        )}
      </label>
      <input
        ref={ref}
        id={fieldId}
        className="dwm-text-field__input"
        data-invalid={Boolean(error) || undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        required={required}
        disabled={disabled}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="dwm-text-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="dwm-text-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
