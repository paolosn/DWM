# Limitaciones reales — DWM v1.0.1

Documento operativo, no promocional. Actualiza `LIMITATIONS-v1.0.0.md` únicamente en
lo que esta corrección cambia; el resto de limitaciones heredadas se mantiene igual y
no se repite aquí salvo que aplique una matización.

## 1. Re-escaneo en caliente: resuelto solo para la vía de importación

v1.0.0 documentaba que activar un Workspace en caliente (Onboarding → «Inicializar y
activar» con una ruta escrita a mano) no disparaba un nuevo escaneo de PSNAdapter sin
reiniciar la app. **Esto sigue siendo así para esa vía manual.**

Lo que cambia en v1.0.1: la vía de **importación** (`import.execute`) sí dispara
automáticamente `PSNAdapter.scanWorkspace()` sobre el destino interno recién copiado,
así que los recursos importados (agentes/skills/reglas/conocimiento/clientes) quedan
listables en la misma sesión, sin reiniciar la aplicación. Es una corrección
específica del flujo de importación, no un mecanismo general de "Workspace activo
cambia en caliente" — esa pieza de diseño más amplia sigue sin construirse.

## 2. Selector nativo: resuelto

v1.0.0 documentaba la ausencia de un selector de carpeta nativo para Workspace; la
ruta se escribía a mano. **Esto sigue siendo así para "Crear Workspace vacío"** (la
vía manual de activar una ruta cualquiera como Workspace nuevo).

Lo que cambia en v1.0.1: `import.*` sí tiene selector nativo completo
(`dwm:selectImportFolder`/`dwm:selectImportZip`, vía `dialog.showOpenDialog` desde el
proceso principal, `contextIsolation` intacto).

## 3. Persistencia del Workspace importado entre reinicios de la aplicación

El destino de una importación (`<dataDir>/workspace/<nombre>` o
`<dataDir>/workspace/SISTEMA-DE-TRABAJO`) es una carpeta _hija_ de `dataDir`
(`app.getPath("userData")`). `WorkspaceLocator` (localización automática de Workspace
al arrancar) busca `.dwm/workspace.json` **hacia arriba** desde `workspaceStartDir`
(que en la app real es el propio `dataDir`), nunca hacia dentro de sus subcarpetas.
Esto significa que, aunque `import.execute` + `workspace.initialize` +
`workspace.register` dejan el Workspace importado correctamente activo **durante la
sesión en curso**, la localización automática al reiniciar la aplicación no lo
volverá a encontrar por sí sola si su ruta es distinta de `dataDir` — es la misma
limitación estructural que ya afecta a cualquier Workspace no ubicado exactamente en
`dataDir` (ver también `LIMITATIONS-v1.0.0.md` §10, sobre `WorkspaceManager` vs
`PortableWorkspaceManager`). No es un bug introducido por esta corrección: es una
limitación preexistente de cómo `composeManagers()` resuelve `workspaceStartDir`
(fijo a `dataDir` en cada arranque), fuera del alcance cerrado de esta entrega
("no rediseñar el Engine ni la localización de Workspace"). Se documenta aquí en vez
de construir un mecanismo de persistencia de ruta de Workspace, que es una pieza de
diseño propia no solicitada explícitamente.

## 4. Application API: operaciones sin exponer

Igual que en v1.0.0 (ver tabla en `LIMITATIONS-v1.0.0.md` §3), con una fila menos:
**Workspace → Selector de carpeta nativo** ya no aplica como limitación para
`import.*` (sigue aplicando para "Crear Workspace vacío", ver §2 arriba).

## 5. Windows/macOS: mismo estado que v1.0.0, con más preparación

`DWM-1.0.1.AppImage` generado y verificado de verdad (Linux). Windows (NSIS) tiene su
configuración completa y reforzada en `build/electron-builder.json5` (accesos
directos, desinstalador, `deleteAppDataOnUninstall: false`), y ahora además un
workflow de GitHub Actions reproducible que sí puede generar el `.exe` en un runner
Windows real — pero **no se generó ni verificó el `.exe` en este entorno** (Linux sin
Wine; no se instaló Wine a propósito, para no añadir herramientas globales
innecesarias). macOS (DMG) sigue sin generarse ni verificarse, mismo motivo que en
v1.0.0 (sin toolchain de macOS).

## 6. Sin firma de código ni notarización

Sin cambios respecto a v1.0.0: no hay certificados de firma disponibles en este
entorno.

## 7. Icono placeholder

Sin cambios respecto a v1.0.0: `packages/desktop-app/build/icon.png` sigue siendo un
placeholder (1024×1024, válido técnicamente para que electron-builder autogenere
`.ico`/`.icns`, pero sin arte final de marca). No se ha diseñado un icono nuevo en
esta corrección, por alcance explícito.

## 8. E2E con interfaz gráfica real

Sin cambios respecto a v1.0.0: no hay Playwright-Electron ni automatización de clics
sobre una ventana visible. Lo añadido en esta corrección es una prueba E2E mínima que
pasa por `IpcRouter`/`createDesktopBridge` reales (con selección nativa simulada a
nivel IPC, documento §7), no una suite de interacción de UI real.

## 9. Alcance explícitamente fuera de esta versión

Sin cambios respecto a v1.0.0: usuarios/roles, nube, Teams, login remoto,
sincronización, comparativas de tarifas (Fase 2) — no implementados por decisión de
alcance, no por limitación técnica.
