import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Tabs } from "../../design-system/composites/Tabs/index.js";
import { ContentLibraryPanel } from "./ContentLibraryPanel.js";
import "./BibliotecaIAScreen.css";

/**
 * Biblioteca IA — pantalla única para Agentes/Skills/Reglas
 * (kilo-content-integration-completion). Una sola implementación real
 * (`ContentLibraryPanel`, parametrizada por `kind`) reutilizada en las
 * tres pestañas — no son tres pantallas con lógica distinta.
 */
export function BibliotecaIAScreen(): JSX.Element {
  return (
    <div className="dwm-biblioteca-ia-screen">
      <PageHeader
        title="Biblioteca IA"
        description="Agentes, Skills y Reglas reales de Kilo Code — global, por cliente o por proyecto."
      />
      <Tabs
        items={[
          { id: "agent", label: "Agentes", content: <ContentLibraryPanel kind="agent" /> },
          { id: "skill", label: "Skills", content: <ContentLibraryPanel kind="skill" /> },
          { id: "rule", label: "Reglas", content: <ContentLibraryPanel kind="rule" /> },
        ]}
      />
    </div>
  );
}
