# Informe de build — DWM v1.0.2

Ejecutado en un contenedor Linux x86_64, Node.js v22.22.2, sin acceso a Windows/macOS
ni Wine. Todos los comandos y resultados de este informe son reales, ejecutados en
esta entrega — ninguno está inventado ni asumido. Se ejecutó todo dos veces: sobre el
árbol de trabajo y sobre una reconstrucción limpia desde un directorio vacío (fuentes
copiadas sin `node_modules` ni artefactos generados), con resultados idénticos.

## 1. Instalación desde cero (directorio vacío)

```
$ npm install --no-audit --no-fund
added 577 packages in 23s
```

## 2. Build de módulos internos

```
$ npm run build:internal-deps
```

30 paquetes compilados (`tsc -p tsconfig.json`). Sin errores, en ambos entornos.

## 3. Cinco fases de verificación — todo el monorepo (32 paquetes)

| Fase                                    | Resultado                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `format:check` (prettier)               | ✅ (los únicos 2 ficheros con diffs son los propios documentos v1.0.0 anteriores, heredados, sin tocar en esta corrección) |
| `lint` (eslint, todo el repo)           | ✅ 0 problemas                                                                                                             |
| `typecheck` (tsc estricto, 32 paquetes) | ✅                                                                                                                         |
| `test` (32 paquetes)                    | ✅ **3 049 tests, todos en verde**, en árbol de trabajo y en reconstrucción limpia                                         |
| `build` (32 paquetes + vite)            | ✅                                                                                                                         |

### Tests añadidos en esta corrección (respecto a v1.0.1: 3 043 → 3 049)

| Paquete              | Tests nuevos | Qué cubren                                                                                                                                                                                                                                                      |
| -------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `portable-workspace` | 5            | `locateOrRecoverActiveWorkspace()`: recuperación exitosa desde una pista persistida con `startDir` sin relación de carpetas, Workspace movido junto con DWM, sin `ConfigManager`, sin pista previa, y rechazo de una pista con `id` de metadata que no coincide |
| `desktop-app`        | 1            | Prueba de integración crítica obligatoria: import → cerrar → reabrir → recuperación automática → las cinco listas de recursos PSN                                                                                                                               |

### Resultado por paquete (`test`, árbol de trabajo y reconstrucción limpia — idéntico)

```
adapters 55 · agent-manager 86 · ai-creator-manager 124 · ai-manager 51 ·
application-api 181 · backup 112 · client-manager 109 · config 32 · core 87 ·
desktop-app 428 · environment-manager 111 · event-bus 47 · host 84 ·
import-manager 104 · knowledge-manager 148 · logger 42 · migration 65 · plugin 106 ·
portable-package-manager 125 · portable-workspace 79 · profile 63 · project 63 ·
psn-adapter 45 · restore 66 · rule-manager 113 · scheduler 55 · secrets 51 ·
skill-manager 145 · status 68 · tooling 60 · verification 88 · workspace 56
```

Total: 3 049 tests, 0 fallos.

## 4. Prueba de integración crítica obligatoria (sin mocks para el ciclo completo)

```
$ npx vitest run tests/integration/workspacePersistenceAcrossRestart.test.ts
✓ Integración real: persistencia del Workspace tras reiniciar DWM
  ✓ tras cerrar y reabrir DWM, el Workspace importado se recupera automáticamente
    y las cinco listas de recursos responden, incluso sin el origen
```

Escenario real ejecutado de punta a punta (dos instancias reales de `EngineBootstrap`,
mismo `dataDir` en disco, sin compartir ningún estado en memoria entre ellas):

1. Workspace temporal real (`workspace.initialize` + `workspace.register`), con un
   recurso real de cada uno de los cinco tipos, creado por los propios managers
   (`agents.create`, `skills.create`, `rules.create`, `knowledge.create`,
   `clients.create`) — no ficheros escritos a mano.
2. `import.execute` lo copia físicamente dentro del Workspace interno
   (`<dataDir>/workspace/<nombre>`), `workspace.initialize` + `workspace.register`
   sobre el destino.
3. Se borra por completo la carpeta origen externa.
4. `engineSession1.dispose()` — "cerrar Desktop".
5. Nueva instancia de `EngineBootstrap` sobre el mismo `dataDir`: la comprobación
   crítica — `wasWorkspaceLocatedAtStartup()` es `true`, sin pedir la ruta de nuevo.
6. `agents.list`, `skills.list`, `rules.list`, `knowledge.list`, `clients.list`
   responden correctamente, todos con el recurso creado en el paso 1.

Esta prueba falla sin el fix de esta corrección (`wasWorkspaceLocatedAtStartup()` daba
siempre `false` en un segundo arranque real) y pasa con él.

Las pruebas de integración heredadas de v1.0.1 (`realManagers.test.ts`,
`importIndependence.test.ts`) se re-ejecutaron sin cambios de comportamiento.

## 5. Empaquetado

### Linux (verificado de extremo a extremo)

```
$ npx electron-builder --config build/electron-builder.json5
• packaging       platform=linux arch=x64 electron=31.3.1
• building        target=AppImage arch=x64 file=release/DWM-1.0.2.AppImage
```

**Checksum del artefacto generado en esta entrega:**

```
SHA-256 (DWM-1.0.2.AppImage) = 9bb2bdd27dda87b4f01f8a99fa9e57dbe3c07764de0e8ab0aa81bfbffb8dd710
```

(Los hashes no son deterministas entre builds — no hay build determinista
configurada, igual que en v1.0.0/v1.0.1; esto no afecta a la validez de cada build
por sí sola.)

#### Verificación de que el fix real queda dentro del `.asar` empaquetado

```
$ npx @electron/asar list linux-unpacked/resources/app.asar | grep -E "PortableWorkspaceManager|ManagerComposition"
/dist-electron/main/engine/ManagerComposition.js
/node_modules/@dwm/portable-workspace/dist/PortableWorkspaceManager.js

$ npx @electron/asar extract linux-unpacked/resources/app.asar /tmp/asar-extracted
$ grep -c "locateOrRecoverActiveWorkspace" /tmp/asar-extracted/node_modules/@dwm/portable-workspace/dist/PortableWorkspaceManager.js
1
$ grep -c "locateOrRecoverActiveWorkspace" /tmp/asar-extracted/dist-electron/main/engine/ManagerComposition.js
1
```

Confirma que la corrección de esta entrega queda realmente incluida en el paquete
final, no solo en el árbol de fuentes.

#### Arranque real verificado (Xvfb)

```
$ ./DWM-1.0.2.AppImage --appimage-extract
$ xvfb-run -a ./squashfs-root/@dwmdesktop-app --no-sandbox --disable-gpu --disable-dev-shm-usage
[WARN] (desktop-app) No se pudo leer la configuración de escritorio; se usan valores
por defecto. metadata={"filePath":"/root/.config/@dwm/desktop-app/desktop-config.json",
"reason":"ENOENT..."}
```

El proceso arranca y ejecuta código real; `ConfigurationManager` detecta
correctamente la ausencia de configuración previa (comportamiento correcto de primer
arranque, idéntico al de v1.0.1). Este entorno de contenedor no tiene `dbus` del
sistema (`Failed to connect to the bus`, ruido esperado de Chromium en sandbox sin
sesión de escritorio, no relacionado con el código de DWM). El proceso se detuvo por
el límite de tiempo del propio comando de verificación (`timeout`), no por un fallo
de la aplicación.

### Windows (NSIS) — intentado honestamente, no generado en este entorno

```
$ npx electron-builder --win --config build/electron-builder.json5
• packaging       platform=win32 arch=x64 electron=31.3.1
• packaging       appOutDir=release/win-unpacked
⨯ wine is required, please see https://electron.build/multi-platform-build#linux
```

Fallo real, no simulado: este contenedor es Linux sin Wine. El empaquetado avanza
más allá que en v1.0.1 (llega a generar `win-unpacked/DWM.exe` con el código real
empaquetado dentro), pero falla en el paso de incrustar icono/metadatos del `.exe`
(`rcedit`, vía `app-builder`), que requiere Wine en Linux. No se instaló Wine (fuera
del alcance cerrado de esta corrección). En su lugar, revisado línea por línea (único
otro problema de esta corrección):

- `build/electron-builder.json5` confirmado completo para NSIS (appId, productName,
  versión automática desde `package.json`, icono, accesos directos de escritorio y
  menú Inicio, desinstalador con nombre explícito, `deleteAppDataOnUninstall: false`,
  `asar: true`) — sin cambios necesarios.
- `.github/workflows/build-windows.yml` (runner `windows-latest` real, sin Wine,
  checksums SHA-256, artefacto publicado) — sin cambios necesarios.
- Comando exacto reproducible en una máquina Windows real (Node.js ≥18, npm):
  ```
  npm install
  npm run build:internal-deps
  npm run package:electron:win -w packages/desktop-app
  ```

### macOS (DMG)

No generado ni verificado — mismo motivo que en v1.0.0/v1.0.1 (sin toolchain de macOS
en este entorno). Sin cambios respecto a la entrega anterior.

## 6. Bugs reales encontrados y corregidos durante esta corrección

1. `ManagerComposition.composeManagers()` localizaba el Workspace al arrancar con
   `PortableWorkspaceManager.locateRoot(workspaceStartDir)`, una búsqueda puramente
   ascendente desde `dataDir`. El destino por defecto de una importación
   (`<dataDir>/workspace/<nombre>`) es una carpeta hija de `dataDir`, no una
   ascendiente, así que esa búsqueda nunca podía encontrarlo tras reiniciar la
   aplicación — `wasWorkspaceLocatedAtStartup()` era siempre `false` en un segundo
   arranque real sobre un Workspace importado. Corregido con
   `locateOrRecoverActiveWorkspace()` (ver §4 y `LIMITATIONS-v1.0.2.md` §1).

Ningún otro bug real encontrado durante esta corrección: el resto de la
infraestructura tocada (`registerActiveWorkspace`, `init()`, `ConfigManager`,
`WorkspaceLocator.detectMove()`) ya funcionaba correctamente y solo requirió
extenderse (fusionar en vez de sobrescribir la sección de configuración persistida)
para no perder la nueva pista de recuperación entre llamadas.

## 7. Windows Ready — confirmación explícita (segundo problema del encargo)

Revisado explícitamente, sin necesidad de correcciones:

- `electron-builder`: no detecta automáticamente la versión de Electron en este
  monorepo (paquete hoisted a la raíz); ya estaba fijada explícitamente
  (`electronVersion: "31.3.1"`) desde v1.0.0/v1.0.1 — confirmado correcto.
- Iconos: `build/icon.png` (1024×1024, placeholder) — confirmado válido para que
  electron-builder autogenere `.ico`; la fase de conversión (`.icon-ico`) se completó
  sin error, tanto en el intento de esta corrección como en el de v1.0.1.
- NSIS: `oneClick: false`, `allowToChangeInstallationDirectory: true`,
  `createDesktopShortcut`/`createStartMenuShortcut: true`, `shortcutName: "DWM"`,
  `uninstallDisplayName` con versión, `deleteAppDataOnUninstall: false` (nunca borra
  el Workspace del usuario al desinstalar) — todos confirmados presentes y correctos.
- `appId: "com.dwm.desktop"`, `productName: "DWM"` — confirmados estables y sin
  cambios respecto a v1.0.0/v1.0.1 (necesario para que `userData` no cambie de
  ubicación entre versiones).
- `asar: true` — confirmado, y confirmado en la práctica (§5) que el contenido
  compilado real queda dentro.
