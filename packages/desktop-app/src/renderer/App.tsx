import { ErrorBoundary } from "./shell/ErrorBoundary.js";
import { AppShell } from "./shell/AppShell.js";

/**
 * Módulo 32 — Desktop Application. Raíz del renderer: envuelve el
 * `AppShell` (vacío) en el manejo global de errores de la UI.
 */
export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
