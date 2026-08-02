import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "./Toast.css";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastInput {
  readonly title: string;
  readonly tone?: ToastTone;
  readonly durationMs?: number;
}

interface ToastRecord extends ToastInput {
  readonly id: string;
}

export interface ToastContextValue {
  showToast(toast: ToastInput): void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * Módulo 33A — Design System. Notificaciones efímeras no bloqueantes.
 * Se anuncian vía `role="status"`/`aria-live` para lectores de pantalla
 * sin robar el foco (a diferencia de `Modal`).
 */
export function ToastProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: ToastInput) => {
      const id = `toast-${counter.current++}`;
      setToasts((current) => [...current, { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.durationMs ?? 4000);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="dwm-toast-stack" aria-live="polite" data-testid="toast-stack">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`dwm-toast dwm-toast--${toast.tone ?? "info"}`}
            data-testid="toast"
          >
            <span>{toast.title}</span>
            <button type="button" aria-label="Descartar" onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast() debe usarse dentro de un <ToastProvider>.");
  }
  return context;
}
