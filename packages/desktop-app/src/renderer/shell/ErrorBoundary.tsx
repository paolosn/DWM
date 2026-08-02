import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Inyectable en pruebas; por defecto registra en `console.error`. */
  readonly onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  readonly error: Error | undefined;
}

/**
 * Módulo 32 — Desktop Application. Manejo global de errores del lado del
 * renderer: cualquier error de render no controlado en `AppShell` (o en
 * las pantallas que el Módulo 33 añada dentro de él) queda contenido aquí
 * en lugar de dejar la ventana en blanco.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.props.onError) {
      this.props.onError(error, info);
    } else {
      console.error("Error no controlado en el renderer del shell Desktop.", error, info);
    }
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" data-testid="error-boundary-fallback">
          <p>Ha ocurrido un error inesperado en la interfaz.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
