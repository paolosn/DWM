export interface HelpTopic {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/**
 * Módulo 33B — Contenido de Ayuda (documento §13). Local y navegable,
 * sin depender de Application API salvo para abrir contexto relacionado
 * (fuera de alcance aquí: la navegación a otras secciones ya la resuelve
 * el propio Sidebar).
 */
export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "primeros-pasos",
    title: "Primeros pasos",
    body: "Abre o crea un Workspace desde Centro de trabajo, activa un perfil en Perfiles, y crea tu primer proyecto desde Proyectos.",
  },
  {
    id: "conceptos",
    title: "Conceptos de DWM",
    body: "Un Workspace agrupa proyectos, perfiles, agentes, skills, reglas y conocimiento. Cada proyecto usa un perfil concreto.",
  },
  {
    id: "proyectos",
    title: "Proyectos",
    body: "Los proyectos se gestionan desde Proyectos: creación, detalle por pestañas y eliminación del registro (nunca de los archivos físicos sin operación explícita).",
  },
  {
    id: "agentes",
    title: "Agentes",
    body: "Los agentes tienen datos libres en formato JSON. Se archivan, restauran y eliminan desde Agentes.",
  },
  {
    id: "skills",
    title: "Skills",
    body: "Cada skill es un SKILL.md en Markdown. Gestiónalas desde Skills.",
  },
  {
    id: "reglas",
    title: "Reglas",
    body: "Las reglas son ficheros Markdown sin editor visual: se editan como texto plano desde Reglas.",
  },
  {
    id: "conocimiento",
    title: "Conocimiento",
    body: "La base de conocimiento admite búsqueda real (no solo filtro local) desde el propio buscador de Conocimiento.",
  },
  {
    id: "clientes",
    title: "Clientes",
    body: "Los clientes muestran sus relaciones reales (proyectos, conocimiento, agentes, skills, reglas vinculados) en su detalle.",
  },
  {
    id: "ai-creator",
    title: "Biblioteca IA",
    body: "Previsualiza siempre antes de crear: nada se escribe hasta aprobar explícitamente la previsualización.",
  },
  {
    id: "backups",
    title: "Backups y restauración",
    body: "Los backups pueden verificarse antes de confiar en ellos. Las restauraciones admiten un modo de prueba (dry-run) antes de aplicar cambios reales.",
  },
  {
    id: "paquetes",
    title: "Paquetes portables",
    body: "Los paquetes se crean e inspeccionan sobre una ruta de fichero .zip explícita; no hay sincronización con la nube.",
  },
  {
    id: "herramientas",
    title: "Herramientas",
    body: "El listado de herramientas refleja lo detectado en el entorno; 'Actualizar detección' vuelve a analizarlo, sin instalar nada.",
  },
  {
    id: "resolucion-problemas",
    title: "Resolución de problemas",
    body: "Revisa Estado para ver advertencias y errores por módulo, y usa 'Verificar todo' para una comprobación completa.",
  },
  {
    id: "atajos",
    title: "Atajos de teclado",
    body: "Ctrl/Cmd+K abre el buscador global. Escape cierra modales, drawers y menús. Las pestañas se navegan con las flechas del teclado.",
  },
  {
    id: "diagnostico",
    title: "Diagnóstico",
    body: "Acerca de DWM incluye un botón para copiar toda la información de versión y entorno al portapapeles.",
  },
];
