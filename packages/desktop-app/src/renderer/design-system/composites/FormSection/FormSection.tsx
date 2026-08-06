import type { ReactNode } from "react";
import "./FormSection.css";

export interface FormSectionProps {
  readonly title?: string;
  readonly description?: string;
  readonly children: ReactNode;
}

/**
 * Sistema visual base (Fase 1) — agrupa campos relacionados dentro de un
 * formulario real (p. ej. "Datos del cliente" / "Alcance del kit"),
 * con espaciado y jerarquía únicos. Sustituye los `<div>` sueltos que
 * cada formulario definía a mano para agrupar sus propios campos.
 */
export function FormSection({ title, description, children }: FormSectionProps): JSX.Element {
  return (
    <fieldset className="dwm-form-section">
      {title && <legend className="dwm-form-section__title">{title}</legend>}
      {description && <p className="dwm-form-section__description">{description}</p>}
      <div className="dwm-form-section__fields">{children}</div>
    </fieldset>
  );
}
