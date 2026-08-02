import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import "./TextArea.css";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
}

/**
 * Módulo 33A — Design System. Área de texto multilinea, mismo contrato de
 * accesibilidad que `TextField` (label/hint/error asociados).
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, error, hint, id, required, disabled, className, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={["dwm-textarea", className].filter(Boolean).join(" ")}>
      <label htmlFor={fieldId} className="dwm-textarea__label">
        {label}
        {required && (
          <span aria-hidden="true" className="dwm-textarea__required">
            {" "}
            *
          </span>
        )}
      </label>
      <textarea
        ref={ref}
        id={fieldId}
        className="dwm-textarea__input"
        data-invalid={Boolean(error) || undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        required={required}
        disabled={disabled}
        rows={rest.rows ?? 4}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="dwm-textarea__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="dwm-textarea__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
