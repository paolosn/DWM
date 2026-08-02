# DWM v1.0.0 — Notas de la entrega

## Resumen

Primera versión integrada y verificable de extremo a extremo de DWM: Core, managers de
dominio, Application API y la aplicación de escritorio completa, conectados de verdad
(no solo probados por separado con mocks).

## Novedades de esta entrega (Módulo 34 — Integración final)

- **Managers de dominio conectados a la Application API real.** Hasta esta entrega,
  `EngineBootstrap` construía la Application API sin ningún manager conectado a
  propósito (placeholder del Módulo 32): toda operación devolvía
  `APP_DEPENDENCY_UNAVAILABLE`. `ManagerComposition.ts` conecta ahora los ~20 managers
  reales (Workspace, Portable Workspace, PSN Adapter, Agent/Skill/Rule/Knowledge/Client,
  Project, Environment, Profile, Plugin, Backup, Restore, Verification, Status,
  Migration, Portable Package, AI Creator, Import, Config, Event Bus).
- **`workspace.initialize` y `workspace.register` conectadas.** Existían en
  `PortableWorkspaceManager` desde antes, pero nunca se habían expuesto en Application
  API: sin ellas no había forma de crear o activar un Workspace desde la aplicación.
- **Corregida la incompatibilidad entre `PortableWorkspaceManager.initializeWorkspace()`
  y `PSNAdapter.scanWorkspace()`**: el primero no creaba la estructura heredada
  (`.kilo/agents`, etc.) que el segundo necesita para reconocer recursos PSN.
- **`package.json` de `desktop-app` corregido**: le faltaban casi todas las
  dependencias de los managers que `ManagerComposition.ts` ya usaba — sin esto, el
  paquete final de electron-builder habría arrancado sin la mayoría del backend.
  Verificado generando y explorando el `.asar` real.
- **`DWM-1.0.0.AppImage` generado y verificado**: arranca de verdad bajo Xvfb en este
  entorno (Linux).
- **Pruebas de integración reales** (`tests/integration/`), sin mocks, contra el
  sistema de archivos real: ciclo completo de un agente (crear/listar/archivar/
  restaurar/eliminar), creación de backup real, arranque sin Workspace con error
  normalizado, y pruebas de seguridad (path traversal, confirmación destructiva,
  ausencia de detalles internos en errores).
- **Versión sincronizada a 1.0.0** en el `package.json` raíz y de `desktop-app`
  (`Electron app.getVersion()` la lee automáticamente; se propaga a "Acerca de DWM").
- **Empaquetado completado**: `electron-builder.json5` con metadata, icono
  (placeholder, identificado como tal), objetivos Windows/macOS/Linux, exclusión de
  fuentes TypeScript y ficheros de test del paquete final.

## Heredado de entregas anteriores

- Módulos 1-31: Core y managers de dominio (congelados).
- Módulo 32: infraestructura Desktop App (Electron seguro, IPC tipado, AppShell base).
- Módulo 33A: Design System, framework de entidades, 8 pantallas base.
- Módulo 33B: 14 pantallas adicionales (Onboarding, Perfiles, Workspaces, AI Creator,
  IA, Herramientas, Plugins, Paquetes, Backups, Estado, Logs, Configuración, Ayuda,
  Acerca de DWM) — 21 secciones activas en total.

## Limitaciones

Ver [`LIMITATIONS-v1.0.0.md`](LIMITATIONS-v1.0.0.md).
