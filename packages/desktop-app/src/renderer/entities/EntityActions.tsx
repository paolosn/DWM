import { DropdownMenu } from "../design-system/composites/DropdownMenu/index.js";
import { IconButton } from "../design-system/primitives/IconButton/index.js";
import type { EntityAction } from "./EntityTypes.js";

export interface EntityActionsProps<T> {
  readonly row: T;
  readonly actions: readonly EntityAction<T>[];
  readonly entityLabel: string;
}

/**
 * Módulo 33A — Framework de entidades (Fase 2). Menú de acciones por fila,
 * genérico y tipado por composición: cada pantalla de entidad decide qué
 * acciones existen y cuándo están disponibles (`isAvailable`), sin que
 * este componente conozca nada de agentes/skills/clientes.
 */
export function EntityActions<T>({
  row,
  actions,
  entityLabel,
}: EntityActionsProps<T>): JSX.Element {
  const available = actions.filter((action) => action.isAvailable?.(row) ?? true);
  return (
    <DropdownMenu
      label={`Acciones para ${entityLabel}`}
      trigger={
        <IconButton
          label={`Acciones para ${entityLabel}`}
          icon={<span aria-hidden="true">⋯</span>}
        />
      }
      items={available.map((action) => ({
        id: action.id,
        label: action.label,
        onSelect: () => action.onSelect(row),
        ...(action.destructive !== undefined ? { destructive: action.destructive } : {}),
      }))}
    />
  );
}
