# Limitaciones reales — DWM v1.1.0

Documento operativo, no promocional. Cubre únicamente lo que cambia con
`client-workflow-v2`; el resto de limitaciones heredadas de
[`LIMITATIONS-v1.0.2.md`](LIMITATIONS-v1.0.2.md) se mantiene igual y no se repite
aquí salvo que aplique una matización.

## 1. El análisis de viabilidad/auditoría no usa IA ni heurísticas de precio

Los formularios de Nueva viabilidad / Nueva auditoría recogen los datos humanos
(descripción, objetivo, presupuesto, plazo, notas) y los trasladan tal cual a
`briefing-inicial.md` al aceptar. **No hay un motor de evaluación de viabilidad**
(ni por IA ni offline con reglas de precio, a diferencia de la herramienta
`PSN-PANEL` original): el veredicto/precio de mercado quedan sin rellenar salvo
que la persona usuaria los aporte. Añadir ese motor está fuera del alcance de
este encargo ("no inventes funcionalidades fuera del flujo definido").

## 2. Pantalla Clientes: sin filtro "con incidencias"

El encargo pide un filtro "con incidencias" en el listado de clientes. No existe
ningún concepto de incidencia en el modelo de datos actual (`Client`, `Project`) ni
una operación pública que lo respalde, así que no se ha simulado: el listado
mantiene únicamente los filtros reales — búsqueda y "incluir archivados".

## 3. Ficha del cliente: Documentos y Actividad no disponibles todavía

Ambas pestañas existen en la ficha (6 pestañas reales) pero declaran
explícitamente "Función no disponible en esta versión" — no hay una operación
pública que indexe documentos por cliente ni que consulte un historial de
eventos, y no se han inventado datos para rellenarlas. Los ficheros reales
(`cliente.json`, `briefing-inicial.md`, `estado-proyecto.md`) siguen existiendo
físicamente dentro de la carpeta de cada proyecto.

## 4. Conexiones compartidas de cliente: formulario de creación compacto

`ClientConnectionsPanel` (ficha del cliente, pestaña "Accesos y conexiones") crea
conexiones con nombre + tipo únicamente. La configuración avanzada específica de
cada tipo de conector (URL, credenciales, opciones de host…) sigue editándose
desde la pestaña "Conexiones" de un proyecto al que la conexión esté asignada —
no se ha duplicado ese formulario rico (`ConnectionFormModal`) para el nivel de
cliente en esta entrega.

## 5. "Abrir carpeta" (explorador de archivos) no está implementado

El encargo lista "Abrir carpeta" como acción de proyecto en la ficha del
cliente. Solo se implementó "Abrir en VS Code" (reutilizando
`EnvironmentManager.openInVSCode`, ya probado). Abrir el explorador de archivos
del sistema operativo (`shell.openPath` de Electron) no tenía ningún mecanismo
previo en el código y añadir uno nuevo se consideró fuera del alcance mínimo de
este encargo.

## 6. Sin selector explícito "cliente existente vs. nuevo" en los 4 formularios

Los formularios de Viabilidad/Auditoría/Seguridad/Nuevo proyecto piden solo el
nombre del cliente o empresa. La reutilización o creación es automática en el
propio `ProjectProvisioningService` (normaliza el nombre a un id y reutiliza si
ya existe un cliente con ese id) — no hay un desplegable para elegir
explícitamente un cliente ya existente por si el nombre no coincide
exactamente. Esto es intencional (mismo comportamiento que la herramienta
original), pero significa que un cliente con un nombre escrito de forma distinta
la segunda vez generará un cliente nuevo en vez de reutilizar el existente.

## 7. "Archivar proyecto" no disponible desde la ficha del cliente

`@dwm/project` no expone una operación de archivado de proyectos (solo
creación/actualización/borrado); la ficha del cliente, por tanto, no ofrece esa
acción para no simular una funcionalidad que el backend no respalda.

## 8. Migración y compatibilidad: verificado, no solo declarado

- Proyectos sin cliente (`ProjectConfiguration.clientId` ausente): se muestran
  con la etiqueta real "Sin cliente asignado" en Proyectos, nunca se ocultan ni
  se eliminan. Verificado con test dedicado.
- Clientes sin proyectos: la ficha muestra el estado vacío real en la pestaña
  Proyectos ("Este cliente todavía no tiene proyectos"); el cliente no se oculta
  ni se archiva automáticamente.
- `cliente.json`/proyectos anteriores a `defaultAi` (Commit 1) siguen leyéndose
  con normalidad — verificado con un test que escribe un `cliente.json` "legado"
  a mano.
- Ningún manager nuevo: `client-workflow-v2` amplía `@dwm/client-manager`,
  `@dwm/project`, `@dwm/connections-manager` (vía su controlador) y
  `@dwm/environment-manager` ya existentes; el único paquete nuevo,
  `@dwm/project-provisioning`, es exclusivamente un orquestador que reutiliza
  `ImportScanner`/`ImportService` de `@dwm/import-manager` para la copia física
  de `PSN-BASE` — no reimplementa staging, copia ni rollback.
