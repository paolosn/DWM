import { forwardRef, useId, type InputHTMLAttributes } from "react";
import "./Checkbox.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  readonly label: string;
  readonly error?: string;
}

/**
 * Módulo 33A — Design System. Casilla de verificación con etiqueta
 * accesible asociada. Soporta `indeterminate` vía prop nativa reenviada
 * por el consumidor con una ref, igual que en HTML estándar.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, id, disabled, className, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className={["dwm-checkbox", className].filter(Boolean).join(" ")}>
      <span className="dwm-checkbox__row">
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          className="dwm-checkbox__input"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={errorId}
          disabled={disabled}
          {...rest}
        />
        <label htmlFor={fieldId} className="dwm-checkbox__label">
          {label}
        </label>
      </span>
      {error && (
        <p id={errorId} className="dwm-checkbox__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
