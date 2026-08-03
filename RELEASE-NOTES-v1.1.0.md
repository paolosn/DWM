# Notas de la versión — DWM v1.1.0

## Resumen

`client-workflow-v2`: DWM reproduce el flujo operativo real observado en
`SISTEMA-DE-TRABAJO/PSN-PANEL` — Viabilidad / Auditoría / Seguridad / Nuevo
proyecto directo → creación o reutilización automática del cliente → duplicado
de `PSN-BASE` → `cliente.json`/`briefing-inicial.md`/`estado-proyecto.md`
reales → apertura automática en VS Code — en vez de exigir a la persona
usuaria elegir una ruta o un perfil técnico para crear un proyecto normal.

Ver [`LIMITATIONS-v1.1.0.md`](LIMITATIONS-v1.1.0.md) para lo que
deliberadamente queda fuera de esta entrega.

## Cambios por área

**Modelo de datos** (`@dwm/client-manager`, `@dwm/project`) — `Client.defaultAi`
(IA predeterminada: proveedor/modelo/fallback/referencia de secreto, nunca un
valor de secreto) y `ProjectConfiguration.clientId` (cliente propietario;
ausente = "Sin cliente asignado", un estado válido). Cien por cien compatible
hacia atrás: ambos campos son opcionales y `ClientRepository` ya hacía
passthrough completo de JSON.

**Creación automática de proyectos** (`@dwm/project-provisioning`, paquete
nuevo) — orquesta `ImportScanner`/`ImportService` de `@dwm/import-manager`
(reutilizados tal cual: mismo staging, mismo commit atómico, mismo rollback) +
`ProjectManager`/`ClientManager`/`ProfileManager` para duplicar `PSN-BASE`,
generar los ficheros reales del proyecto, seleccionar el perfil automáticamente
(activo o único disponible) y crear/reutilizar el cliente por nombre
normalizado. Nunca pide ruta ni perfil técnico.

**Flujos de entrada** (`application-api`, `desktop-app`) — una única operación
`provisioning.create-project` (discriminada por categoría) sirve a los cuatro
formularios (Viabilidad, Auditoría, Seguridad, Nuevo proyecto directo). Tras
crear: abre VS Code (reutilizando `EnvironmentManager.openInVSCode`, construido
sobre el mismo `ProcessRunner` que ya usaba `VSCodeDetector`) y marca el
proyecto como activo (`ProjectManager.openProject`, ya existente).

**Pantalla Clientes y ficha** — listado ya existente ampliado con "Última
actividad"; ficha completa con 6 pestañas reales (Resumen, Proyectos, Accesos y
conexiones, MCP e IA, Documentos, Actividad). Proyectos resuelve cada id real y
permite abrir en VS Code (`projects.open-in-vscode`, nueva operación que
reutiliza el mismo lanzador).

**Conexiones/secretos/MCP/IA compartidos de cliente** — `ConnectionsManager` y
su controlador, ampliados (no duplicados) para una raíz de persistencia por
cliente (`CLIENTES/.connections/<clientId>`) además de por proyecto. La
asignación cliente↔proyecto reutiliza el sistema de _grants_ ya existente
(denegación por defecto, nunca automática).

**Migración y compatibilidad** — proyectos sin cliente y clientes sin proyecto
se conservan y se muestran honestamente, nunca se ocultan; nada de lo heredado
(Workspaces importados, Connections/MCP/Secrets Manager, perfiles, backups,
restauraciones, instaladores, preload CommonJS, workflows de CI, iconos,
detección de VS Code) se ha tocado fuera de lo descrito arriba.

## Verificación

Cinco commits incrementales en `feature/client-workflow-v2`
(`a43cbe6`…`6c19751`), cada uno con typecheck, suite de tests, lint y build en
verde antes de su push. Ver el informe final de la rama para el detalle
completo por commit.
