import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { DesktopNavigationSection } from "../../shared/types/DesktopConfig.js";

export interface NavigationContextValue {
  readonly activeSection: DesktopNavigationSection;
  setActiveSection(section: DesktopNavigationSection): void;
  /**
   * Cliente real a prerrellenar la próxima vez que se navegue a
   * "provisioning" (Nuevo trabajo) — así "Crear proyecto"/"Nuevo
   * trabajo" desde la ficha de un cliente reutilizan el mismo
   * provisioning unificado sin pedirle de nuevo el nombre. Se limpia
   * tras leerse una vez.
   */
  readonly pendingProvisioningClientName: string | undefined;
  navigateToProvisioning(clientName?: string): void;
  clearPendingProvisioningClientName(): void;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export interface NavigationProviderProps {
  readonly initialSection?: DesktopNavigationSection;
  readonly children: ReactNode;
}

/**
 * Módulo 32 — Desktop Application. Sistema de navegación preparado para el
 * Módulo 33: mantiene qué sección está activa, pero deliberadamente no
 * sabe nada sobre el contenido de cada sección (eso son las pantallas
 * funcionales, fuera del alcance de este módulo).
 */
export function NavigationProvider({
  initialSection = "dashboard",
  children,
}: NavigationProviderProps): JSX.Element {
  const [activeSection, setActiveSection] = useState<DesktopNavigationSection>(initialSection);
  const [pendingProvisioningClientName, setPendingProvisioningClientName] = useState<
    string | undefined
  >(undefined);

  const value = useMemo<NavigationContextValue>(
    () => ({
      activeSection,
      setActiveSection,
      pendingProvisioningClientName,
      navigateToProvisioning: (clientName?: string) => {
        setPendingProvisioningClientName(clientName);
        setActiveSection("provisioning");
      },
      clearPendingProvisioningClientName: () => setPendingProvisioningClientName(undefined),
    }),
    [activeSection, pendingProvisioningClientName]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation() debe usarse dentro de un <NavigationProvider>.");
  }
  return context;
}
