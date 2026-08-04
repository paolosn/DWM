import { useEffect, type JSX } from "react";
import { NAVIGATION_CATALOG } from "./navigationCatalog.js";
import { useNavigation } from "./NavigationContext.js";
import { PageHeader } from "../design-system/composites/PageHeader/index.js";
import { EmptyState } from "../design-system/composites/EmptyState/index.js";
import { AgentsScreen } from "../screens/agents/AgentsScreen.js";
import { SkillsScreen } from "../screens/skills/SkillsScreen.js";
import { RulesScreen } from "../screens/rules/RulesScreen.js";
import { BibliotecaIAScreen } from "../screens/library/BibliotecaIAScreen.js";
import { KnowledgeScreen } from "../screens/knowledge/KnowledgeScreen.js";
import { ClientsScreen } from "../screens/clients/ClientsScreen.js";
import { DashboardScreen } from "../screens/dashboard/DashboardScreen.js";
import { ProvisioningScreen } from "../screens/provisioning/ProvisioningScreen.js";
import { WorkspaceScreen } from "../screens/workspace/WorkspaceScreen.js";
import { ProjectsScreen } from "../screens/projects/ProjectsScreen.js";
import { ProfilesScreen } from "../screens/profiles/ProfilesScreen.js";
import { WorkspacesScreen } from "../screens/workspaces/WorkspacesScreen.js";
import { AICreatorScreen } from "../screens/ai-creator/AICreatorScreen.js";
import { AIProvidersScreen } from "../screens/ai-providers/AIProvidersScreen.js";
import { ToolsScreen } from "../screens/tools/ToolsScreen.js";
import { PluginsScreen } from "../screens/plugins/PluginsScreen.js";
import { PackagesScreen } from "../screens/packages/PackagesScreen.js";
import { BackupsScreen } from "../screens/backups/BackupsScreen.js";
import { StatusScreen } from "../screens/status/StatusScreen.js";
import { LogsScreen } from "../screens/logs/LogsScreen.js";
import { SettingsScreen } from "../screens/settings/SettingsScreen.js";
import { HelpScreen } from "../screens/help/HelpScreen.js";
import { AboutScreen } from "../screens/about/AboutScreen.js";
import type { DesktopNavigationSection } from "../../shared/types/DesktopConfig.js";
import "./ContentArea.css";

/**
 * Módulos 33A/33B — AppShell definitivo. Área de contenido (documento
 * §7). Todas las 21 secciones reales tienen ya su pantalla propia
 * (`EntityPage` en las de entidad, `PageHeader` directo en el resto).
 */
const IMPLEMENTED_SCREENS: Partial<Record<DesktopNavigationSection, () => JSX.Element>> = {
  dashboard: DashboardScreen,
  provisioning: ProvisioningScreen,
  workspace: WorkspaceScreen,
  projects: ProjectsScreen,
  aiLibrary: BibliotecaIAScreen,
  agents: AgentsScreen,
  skills: SkillsScreen,
  rules: RulesScreen,
  knowledge: KnowledgeScreen,
  clients: ClientsScreen,
  profiles: ProfilesScreen,
  workspaces: WorkspacesScreen,
  aiCreator: AICreatorScreen,
  ai: AIProvidersScreen,
  tools: ToolsScreen,
  plugins: PluginsScreen,
  packages: PackagesScreen,
  backups: BackupsScreen,
  status: StatusScreen,
  logs: LogsScreen,
  settings: SettingsScreen,
  help: HelpScreen,
  about: AboutScreen,
};

export function ContentArea(): JSX.Element {
  const { activeSection, pendingProvisioningClientName, clearPendingProvisioningClientName } =
    useNavigation();
  const Screen = IMPLEMENTED_SCREENS[activeSection];

  useEffect(() => {
    if (activeSection === "provisioning" && pendingProvisioningClientName !== undefined) {
      clearPendingProvisioningClientName();
    }
  }, [activeSection]);

  if (activeSection === "provisioning") {
    return (
      <section aria-label="Contenido" data-testid="content-area" className="dwm-content-area">
        <ProvisioningScreen
          {...(pendingProvisioningClientName
            ? { initialClientName: pendingProvisioningClientName }
            : {})}
        />
      </section>
    );
  }

  if (Screen) {
    return (
      <section aria-label="Contenido" data-testid="content-area" className="dwm-content-area">
        <Screen />
      </section>
    );
  }

  const item = NAVIGATION_CATALOG.find((entry) => entry.section === activeSection);
  const label = item?.label ?? activeSection;

  return (
    <section aria-label="Contenido" data-testid="content-area" className="dwm-content-area">
      <PageHeader title={label} />
      <EmptyState
        title={`«${label}» se implementa más adelante en esta misma fase`}
        description="La estructura de navegación y el sistema visual ya están operativos; el contenido funcional de esta sección llega a continuación."
      />
    </section>
  );
}
