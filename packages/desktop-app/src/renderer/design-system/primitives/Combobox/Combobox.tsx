import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import "./Combobox.css";

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
}

export interface ComboboxProps {
  readonly label: string;
  readonly options: readonly ComboboxOption[];
  readonly value: string | undefined;
  readonly onChange: (value: string | undefined) => void;
  readonly placeholder?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly emptyMessage?: string;
}

/**
 * Módulo 33A — Design System. Selector con filtrado por texto sobre una
 * lista de opciones ya cargada (patrón `combobox` de WAI-ARIA con
 * `listbox`). Navegación con flechas, `Enter` para confirmar, `Escape`
 * para cerrar sin cambiar el valor.
 */
export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
  emptyMessage = "Sin resultados",
}: ComboboxProps): JSX.Element {
  const fieldId = useId();
  const listboxId = `${fieldId}-listbox`;
  const errorId = error ? `${fieldId}-error` : undefined;
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selectedOption?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  function commit(option: ComboboxOption | undefined): void {
    onChange(option?.value);
    setQuery(option?.label ?? "");
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (open && option) commit(option);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(selectedOption?.label ?? "");
    }
  }

  return (
    <div className="dwm-combobox">
      <label htmlFor={fieldId} className="dwm-combobox__label">
        {label}
      </label>
      <input
        ref={inputRef}
        id={fieldId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={errorId}
        className="dwm-combobox__input"
        data-invalid={Boolean(error) || undefined}
        placeholder={placeholder}
        disabled={disabled}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 100);
        }}
      />
      {open && (
        <ul id={listboxId} role="listbox" className="dwm-combobox__listbox">
          {filtered.length === 0 && <li className="dwm-combobox__empty">{emptyMessage}</li>}
          {filtered.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              data-active={index === activeIndex}
              className="dwm-combobox__option"
              onMouseDown={(event) => {
                event.preventDefault();
                commit(option);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={errorId} className="dwm-combobox__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
