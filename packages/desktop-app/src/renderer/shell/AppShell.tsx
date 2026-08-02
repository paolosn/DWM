import { useEffect, useState } from "react";
import {
  NavigationProvider,
  useNavigation,
  type NavigationProviderProps,
} from "./NavigationContext.js";
import { Sidebar } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";
import { ContentArea } from "./ContentArea.js";
import { VersionFooter, type VersionInfoFetcher } from "./VersionFooter.js";
import { CommandPalette } from "./CommandPalette/index.js";
import { ToastProvider } from "../design-system/composites/Toast/index.js";
import "../design-system/tokens/index.js";
import "./AppShell.css";

export interface AppShellProps {
  readonly initialSection?: NavigationProviderProps["initialSection"];
  readonly fetchVersionInfo?: VersionInfoFetcher;
}

function AppShellContent({
  fetchVersionInfo,
}: {
  readonly fetchVersionInfo?: VersionInfoFetcher;
}): JSX.Element {
  const { setActiveSection } = useNavigation();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isShortcut) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div data-testid="app-shell" className="dwm-app-shell">
      <Sidebar />
      <div className="dwm-app-shell__main">
        <Topbar
          {...(fetchVersionInfo ? { fetchVersionInfo } : {})}
          onOpenSearch={() => setPaletteOpen(true)}
        />
        <ContentArea />
        <VersionFooter {...(fetchVersionInfo ? { fetchVersionInfo } : {})} />
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={setActiveSection}
      />
    </div>
  );
}

/**
 * Módulo 33A — AppShell definitivo: Sidebar + Topbar + área de contenido
 * (documento §7), sobre el sistema de navegación del Módulo 32
 * (`NavigationProvider`, sin modificar). `ToastProvider` envuelve toda la
 * app para que cualquier pantalla de una fase posterior pueda notificar
 * el resultado de una mutación sin volver a montar su propio proveedor.
 * El Command Palette (§10) se monta aquí porque necesita tanto el atajo
 * de teclado global como acceso a `setActiveSection`.
 */
export function AppShell({ initialSection, fetchVersionInfo }: AppShellProps): JSX.Element {
  return (
    <NavigationProvider {...(initialSection ? { initialSection } : {})}>
      <ToastProvider>
        <AppShellContent {...(fetchVersionInfo ? { fetchVersionInfo } : {})} />
      </ToastProvider>
    </NavigationProvider>
  );
}
