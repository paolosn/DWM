# Limitaciones reales — DWM v1.0.2

Documento operativo, no promocional. Actualiza `LIMITATIONS-v1.0.1.md` únicamente en
lo que esta corrección de estabilización cambia; el resto de limitaciones heredadas
se mantiene igual y no se repite aquí salvo que aplique una matización.

## 1. Persistencia del Workspace importado entre reinicios: RESUELTO

`LIMITATIONS-v1.0.1.md` §3 documentaba que, aunque `import.execute` +
`workspace.initialize` + `workspace.register` dejaban el Workspace importado
correctamente activo **durante la sesión en curso**, la localización automática al
reiniciar la aplicación no lo volvía a encontrar por sí sola, porque
`composeManagers()` usaba `PortableWorkspaceManager.locateRoot(workspaceStartDir)`:
una búsqueda puramente ascendente desde `dataDir` (`app.getPath("userData")`, fijo en
cada arranque). El destino por defecto de una importación
(`<dataDir>/workspace/<nombre>`) es una carpeta _hija_ de `dataDir`, así que esa
búsqueda ascendente nunca podía encontrarlo — ni tampoco un Workspace externo situado
en cualquier otra ubicación sin relación de ascendencia con `dataDir`.

**Esta corrección lo resuelve** sin rediseñar el Engine ni la localización de
Workspace:

- `PortableWorkspaceManager.registerActiveWorkspace()` ahora persiste, junto al `id`
  de metadata que ya guardaba, la ruta del Workspace activo (`lastKnownRoot`) en la
  sección `"portable-workspace"` de `ConfigManager` — la única información mínima
  necesaria; nunca se trata como fuente de verdad, solo como pista de recuperación.
- Nuevo método `PortableWorkspaceManager.locateOrRecoverActiveWorkspace()`: al
  arrancar, revalida esa pista contra la metadata real del Workspace (comprobando que
  la carpeta siga existiendo y que su `id` siga coincidiendo) antes de confiar en
  ella. Si ya no es válida en esa ruta exacta, reutiliza `WorkspaceLocator.detectMove()`
  (ya existente y probado desde antes de esta corrección) para comprobar si el
  Workspace fue movido junto con DWM, buscando desde `workspaceStartDir` una raíz con
  el mismo `id`. Sin pista previa o sin `ConfigManager`, el comportamiento es idéntico
  al `locateRoot()` original.
- `ManagerComposition.composeManagers()` usa ahora `locateOrRecoverActiveWorkspace()`
  en el arranque, en vez de `locateRoot()`.

Verificado con una prueba de integración real y obligatoria
(`packages/desktop-app/tests/integration/workspacePersistenceAcrossRestart.test.ts`)
que reproduce el escenario exacto del encargo: crear un Workspace temporal con un
recurso real de cada uno de los cinco tipos (agente, skill, regla, conocimiento,
cliente), importarlo, cerrar la aplicación (`dispose()`), abrir una instancia
completamente nueva sobre el mismo `dataDir`, confirmar que
`wasWorkspaceLocatedAtStartup()` es `true` sin volver a pedir la ruta, y confirmar que
las cinco listas (`agents.list`, `skills.list`, `rules.list`, `knowledge.list`,
`clients.list`) responden correctamente — incluso después de borrar por completo la
carpeta origen externa. Añadidas también 5 pruebas unitarias en
`PortableWorkspaceManager.test.ts` que cubren la recuperación exitosa, el caso de
Workspace movido junto con DWM, la ausencia de `ConfigManager`, la ausencia de pista
previa, y el rechazo de una pista cuyo `id` de metadata no coincide (para dejar
explícito que la pista nunca se usa a ciegas).

## 2. Windows (NSIS): configuración reconfirmada, `.exe` no generado en este entorno

Revisada línea por línea en esta corrección (único otro problema del encargo, alcance
cerrado): `build/electron-builder.json5` (`appId`, `productName`, versión automática
desde `package.json`, icono, accesos directos de escritorio y menú Inicio,
desinstalador con nombre explícito, `deleteAppDataOnUninstall: false`, `asar: true`),
`package.json` (`main`, scripts `package:electron`/`package:electron:win`), y
`.github/workflows/build-windows.yml` (runner `windows-latest` real, sin Wine,
checksums SHA-256, artefacto publicado). Todo confirmado correcto y completo; no fue
necesario corregir nada.

Se intentó honestamente generar el `.exe` en este entorno
(`npx electron-builder --win --config build/electron-builder.json5`): el empaquetado
avanza (descarga Electron para win32, genera `win-unpacked/DWM.exe` con el código real
dentro), pero falla en el paso de incrustar el icono/metadatos del ejecutable
(`rcedit`, vía `app-builder`), que requiere Wine en Linux:

```
⨯ wine is required, please see https://electron.build/multi-platform-build#linux
```

No se instaló Wine (fuera del alcance cerrado de esta corrección: "NO usar Wine"). La
vía reproducible sigue siendo el workflow de GitHub Actions ya existente
(`windows-latest`), documentado con el comando exacto también reproducible en una
máquina Windows real. Sin cambios de fondo respecto a `LIMITATIONS-v1.0.1.md` §5 más
allá de esta reconfirmación.

## 3. Resto de limitaciones: sin cambios

Todo lo demás se mantiene igual que en `LIMITATIONS-v1.0.1.md`: re-escaneo en
caliente solo resuelto para la vía de importación (§1), selector nativo solo para
`import.*` (§2), tabla de operaciones de Application API sin exponer (§4), sin firma
de código ni notarización (§6), icono placeholder (§7), sin E2E con interfaz gráfica
real (§8), y alcance explícitamente fuera de esta versión (§9). Ninguno de estos
puntos formaba parte del encargo cerrado de esta corrección (los dos únicos problemas
tratados son los §1 y §2 de este documento).
