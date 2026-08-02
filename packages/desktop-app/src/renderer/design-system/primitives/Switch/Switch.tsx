import { forwardRef, useId, type InputHTMLAttributes } from "react";
import "./Switch.css";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> {
  readonly label: string;
}

/**
 * Módulo 33A — Design System. Interruptor binario implementado como
 * checkbox nativo con `role="switch"` para semántica correcta en
 * lectores de pantalla.
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, id, disabled, className, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <label
      htmlFor={fieldId}
      className={["dwm-switch", disabled ? "dwm-switch--disabled" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        ref={ref}
        id={fieldId}
        type="checkbox"
        role="switch"
        className="dwm-switch__input"
        disabled={disabled}
        {...rest}
      />
      <span className="dwm-switch__track" aria-hidden="true">
        <span className="dwm-switch__thumb" />
      </span>
      <span className="dwm-switch__label">{label}</span>
    </label>
  );
});
