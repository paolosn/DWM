import type { HTMLAttributes, ReactNode } from "react";
import "./Card.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  readonly padded?: boolean;
}

/**
 * Módulo 33A — Design System. Contenedor de superficie base (documento
 * §5: radio 10-12px, sombra discreta, sin degradados).
 */
export function Card({ children, padded = true, className, ...rest }: CardProps): JSX.Element {
  const classes = ["dwm-card", padded ? "dwm-card--padded" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
