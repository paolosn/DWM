import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import "./IconButton.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Nombre accesible obligatorio: un IconButton nunca lleva texto visible. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly loading?: boolean;
}

/**
 * Módulo 33A — Design System. Botón de solo icono. Exige `label` para
 * garantizar nombre accesible (documento §17 "tooltips para iconos",
 * "nombres accesibles en botones").
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, loading = false, disabled, className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      className={["dwm-icon-button", className].filter(Boolean).join(" ")}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span
          className="dwm-icon-button__spinner"
          aria-hidden="true"
          data-testid="icon-button-spinner"
        />
      ) : (
        <span className="dwm-icon-button__icon" aria-hidden="true">
          {icon}
        </span>
      )}
    </button>
  );
});
