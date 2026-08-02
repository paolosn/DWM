# DWM v1.0.1 — Notas de la entrega

## Resumen

Corrección de aceptación final sobre v1.0.0: DWM ya puede **importar físicamente** un
SISTEMA-DE-TRABAJO externo (carpeta o ZIP) copiándolo dentro de su Workspace interno,
en vez de quedar dependiendo de la carpeta origen. Esta era la única pieza que
bloqueaba la entrega anterior.

## Novedades de esta entrega

- **`ImportManager` expuesto en la Application API.** Ya existía completo desde antes
  (Módulo 21), pero ningún controlador lo usaba: `import.inspect`, `import.preview`,
  `import.execute`, `import.status`, `import.cancel` son operaciones nuevas,
  delegando exclusivamente en su API pública.
- **Selector nativo de carpeta/ZIP.** Dos canales IPC nuevos
  (`dwm:selectImportFolder`, `dwm:selectImportZip`) abren el diálogo nativo de
  Electron desde el proceso principal; el renderer nunca toca el sistema de ficheros.
  Cancelar el diálogo nunca se trata como error.
- **Flujo real conectado en Onboarding.** Nuevo panel (`ImportWorkspacePanel`):
  selector → `import.inspect`/`import.preview` (origen, destino interno, archivos,
  ocultos, tamaño, conflictos) → aprobación explícita → `import.execute` con progreso
  → activación del Workspace interno → resumen final con conteos reales de
  agentes/skills/reglas/conocimiento/clientes/proyectos importados.
- **Reescaneo automático tras importar.** `import.execute` ejecuta automáticamente
  `PSNAdapter.scanWorkspace()` sobre el destino interno recién copiado. Un fallo del
  reescaneo no deshace la importación ya completada — se refleja en la respuesta
  (`rescanned`/`rescanWarning`), nunca se oculta.
- **Windows: instalador NSIS documentado y reproducible.** `electron-builder.json5`
  con accesos directos de escritorio/menú Inicio, nombre de desinstalador, y
  `deleteAppDataOnUninstall: false` explícito (nunca borra el Workspace del usuario).
  Workflow de GitHub Actions (`.github/workflows/build-windows.yml`) que genera el
  `.exe` en un runner Windows real, con checksums SHA-256.
- **Versión sincronizada a 1.0.1** en el `package.json` raíz y de `desktop-app`.

## Bugs reales encontrados y corregidos durante esta corrección

Ninguno de estos estaba en el alcance original del encargo; todos se descubrieron al
verificar el flujo de importación de extremo a extremo, sin mocks:

1. **`ImportManager` no tenía `workspacePaths` conectado** en `ManagerComposition.ts`:
   toda importación real habría fallado con `IMPORT_DESTINATION_UNRESOLVABLE`.
2. **`IpcRouter` no otorgaba ninguna capacidad al `caller` del renderer** (
   `privileged: false` sin `grantedCapabilities`): con el sistema de permisos
   "deniega por defecto", **ninguna** operación de la aplicación real habría
   funcionado nunca a través del IPC empaquetado — no solo import. Corregido
   otorgando `ALL_APPLICATION_CAPABILITIES` (la app es local, de un único usuario,
   sin modelo de autenticación propio).
3. **Zip Slip / path traversal / symlinks peligrosos sin protección** en
   `ImportScanner`: ni las entradas de un ZIP ni el destino de un symlink se
   validaban antes de aceptarlos. Corregido usando el código de error
   `IMPORT_UNSAFE_PATH`, que ya existía en el catálogo pero nunca se lanzaba.
4. **`ImportWorkspacePanel` intentaba `workspace.register` sin `workspace.initialize`
   antes**: habría fallado siempre sobre un destino recién importado (sin metadata
   portable todavía).

## Heredado de v1.0.0

Ver [`RELEASE-NOTES-v1.0.0.md`](RELEASE-NOTES-v1.0.0.md): Core y managers de dominio,
Application API, Desktop App completa (21 secciones activas), managers de dominio
conectados de verdad, empaquetado Linux verificado.

## Limitaciones

Ver [`LIMITATIONS-v1.0.1.md`](LIMITATIONS-v1.0.1.md).
