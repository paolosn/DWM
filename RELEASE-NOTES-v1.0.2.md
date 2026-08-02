# DWM v1.0.2 — Notas de la entrega

## Resumen

Corrección de estabilización sobre v1.0.1, con alcance cerrado a dos problemas: el
Workspace importado ahora **se recupera automáticamente al reabrir DWM**, sin volver
a pedir la ruta, y el instalador Windows (NSIS) quedó revisado y confirmado completo.
No se tocó ningún módulo congelado, ni el Engine, ni la UI, ni ninguna funcionalidad
ya verificada — el alcance estuvo completamente cerrado desde el encargo, tal como se
pidió.

## Novedades de esta entrega

- **Workspace persistente entre reinicios (Problema 1).** `PortableWorkspaceManager`
  ahora persiste la ruta del Workspace activo (`lastKnownRoot`) junto a su `id` de
  metadata, como una pista mínima de recuperación — nunca como fuente de verdad.
  Nuevo método `locateOrRecoverActiveWorkspace()`: revalida esa pista contra la
  metadata real antes de confiar en ella, y reutiliza `WorkspaceLocator.detectMove()`
  (ya existente) para el caso de que el Workspace se haya movido junto con DWM.
  `ManagerComposition.ts` lo usa en el arranque en vez de la búsqueda ascendente
  original, que nunca podía encontrar un Workspace importado en
  `<dataDir>/workspace/<nombre>` (una carpeta hija de `dataDir`, no una ascendiente).
- **Windows (NSIS): revisado y confirmado completo (Problema 2).** `appId`,
  `productName`, icono, accesos directos, desinstalador, `deleteAppDataOnUninstall`,
  `asar`, y el workflow `.github/workflows/build-windows.yml` (runner `windows-latest`
  real) — todo revisado línea por línea; no fue necesario corregir nada. El `.exe` no
  se generó en este entorno (Linux sin Wine, no instalado a propósito); ver
  `LIMITATIONS-v1.0.2.md` §2 para el detalle honesto de hasta dónde llega el
  empaquetado sin Wine.
- **Versión sincronizada a 1.0.2** en el `package.json` raíz y de `desktop-app`.

## Pruebas añadidas

- **Prueba de integración crítica obligatoria**
  (`packages/desktop-app/tests/integration/workspacePersistenceAcrossRestart.test.ts`):
  reproduce el escenario exacto del encargo — crear Workspace temporal con un recurso
  real de cada uno de los cinco tipos → importar → cerrar Desktop → abrir Desktop
  nuevo → `wasWorkspaceLocatedAtStartup()` es `true` sin pedir la ruta →
  `agents.list`/`skills.list`/`rules.list`/`knowledge.list`/`clients.list` responden
  correctamente → el origen ya no existe → todo sigue funcionando.
- **5 pruebas unitarias nuevas** en `PortableWorkspaceManager.test.ts`: recuperación
  exitosa desde una pista persistida con `startDir` sin relación de carpetas,
  Workspace movido junto con DWM, ausencia de `ConfigManager`, ausencia de pista
  previa, y rechazo de una pista con `id` de metadata que no coincide.

## No incluido en esta entrega (alcance explícitamente cerrado)

Ningún módulo nuevo: no se empezó ni `Client Delivery Manager` ni `MCP Manager`, tal
como pedía el encargo.

## Heredado de v1.0.1

Ver [`RELEASE-NOTES-v1.0.1.md`](RELEASE-NOTES-v1.0.1.md): importación física de
SISTEMA-DE-TRABAJO (selector nativo, previsualización, reescaneo automático), Core y
managers de dominio, Application API, Desktop App completa (21 pantallas).

## Limitaciones

Ver [`LIMITATIONS-v1.0.2.md`](LIMITATIONS-v1.0.2.md).
