import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "destructive";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly loading?: boolean;
  readonly leadingIcon?: ReactNode;
}

/**
 * Módulo 33A — Design System. Botón base con las tres variantes definidas
 * en el documento (§8 "Componentes reutilizables"): PrimaryButton,
 * SecondaryButton, DestructiveButton se implementan como una única
 * primitiva parametrizada por `variant`, evitando tres componentes casi
 * idénticos.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading = false, leadingIcon, disabled, children, className, ...rest },
  ref
) {
  const classes = ["dwm-button", `dwm-button--${variant}`, className].filter(Boolean).join(" ");

  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-variant={variant}
      {...rest}
    >
      {loading && (
        <span className="dwm-button__spinner" aria-hidden="true" data-testid="button-spinner" />
      )}
      {!loading && leadingIcon && (
        <span className="dwm-button__icon" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      <span className="dwm-button__label">{children}</span>
    </button>
  );
});
