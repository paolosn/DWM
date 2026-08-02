import { cloneElement, useId, useState, type ReactElement } from "react";
import "./Tooltip.css";

interface TooltipTriggerProps {
  readonly "aria-describedby"?: string;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly onMouseEnter?: () => void;
  readonly onMouseLeave?: () => void;
}

export interface TooltipProps {
  readonly content: string;
  readonly children: ReactElement<TooltipTriggerProps>;
}

/**
 * Módulo 33A — Design System. Tooltip accesible: aparece en hover y en
 * foco de teclado por igual, asociado vía `aria-describedby` (documento
 * §17: "tooltips para iconos").
 */
export function Tooltip({ content, children }: TooltipProps): JSX.Element {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  const child = cloneElement(children, {
    "aria-describedby": tooltipId,
    onFocus: () => setVisible(true),
    onBlur: () => setVisible(false),
    onMouseEnter: () => setVisible(true),
    onMouseLeave: () => setVisible(false),
  });

  return (
    <span className="dwm-tooltip">
      {child}
      <span
        id={tooltipId}
        role="tooltip"
        className="dwm-tooltip__bubble"
        data-visible={visible}
        hidden={!visible}
      >
        {content}
      </span>
    </span>
  );
}
