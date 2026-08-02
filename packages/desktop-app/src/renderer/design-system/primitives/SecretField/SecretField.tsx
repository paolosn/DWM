import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import "./SecretField.css";

export interface SecretFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
}

/**
 * Módulo 33A — Design System. Campo para valores sensibles (tokens,
 * credenciales). Oculto por defecto (documento §14 "no exponer
 * secretos"); el propio componente nunca registra su valor en consola ni
 * lo expone salvo que el usuario pulse revelar.
 */
export const SecretField = forwardRef<HTMLInputElement, SecretFieldProps>(function SecretField(
  { label, error, hint, id, required, disabled, className, ...rest },
  ref
) {
  const [revealed, setRevealed] = useState(false);
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={["dwm-secret-field", className].filter(Boolean).join(" ")}>
      <label htmlFor={fieldId} className="dwm-secret-field__label">
        {label}
        {required && (
          <span aria-hidden="true" className="dwm-secret-field__required">
            {" "}
            *
          </span>
        )}
      </label>
      <div className="dwm-secret-field__row">
        <input
          ref={ref}
          id={fieldId}
          type={revealed ? "text" : "password"}
          className="dwm-secret-field__input"
          autoComplete="off"
          spellCheck={false}
          data-invalid={Boolean(error) || undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          required={required}
          disabled={disabled}
          {...rest}
        />
        <button
          type="button"
          className="dwm-secret-field__toggle"
          onClick={() => setRevealed((current) => !current)}
          disabled={disabled}
          aria-pressed={revealed}
        >
          {revealed ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {hint && !error && (
        <p id={hintId} className="dwm-secret-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="dwm-secret-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
