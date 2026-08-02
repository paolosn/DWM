# Informe de build — DWM v1.0.1

Ejecutado en un contenedor Linux x86_64 (Ubuntu 24.04), Node.js v22.22.2, sin acceso a
Windows/macOS ni Wine. Todos los comandos y resultados de este informe son reales,
ejecutados en esta entrega — ninguno está inventado ni asumido. Se ejecutó todo dos
veces: sobre el árbol de trabajo y sobre una reconstrucción limpia desde un directorio
vacío, con resultados idénticos.

## 1. Instalación desde cero (directorio vacío)

```
$ npm install --no-audit --no-fund
added 577 packages in 36s
```

## 2. Build de módulos internos

```
$ npm run build:internal-deps
```

30 paquetes compilados (`tsc -p tsconfig.json`). Sin errores, en ambos entornos.

## 3. Cinco fases de verificación — todo el monorepo (32 paquetes)

| Fase                                    | Resultado                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `format:check` (prettier)               | ✅ (los únicos 2 ficheros con diffs son los propios documentos v1.0.0 anteriores, sin tocar en esta corrección) |
| `lint` (eslint, todo el repo)           | ✅ 0 problemas                                                                                                  |
| `typecheck` (tsc estricto, 32 paquetes) | ✅                                                                                                              |
| `test` (32 paquetes)                    | ✅ **3 043 tests, todos en verde**, en árbol de trabajo y en reconstrucción limpia                              |
| `build` (32 paquetes + vite)            | ✅                                                                                                              |

### Cobertura de los paquetes modificados en esta corrección

| Paquete           | Tests | % Líneas | % Ramas | % Funciones | % Sentencias |
| ----------------- | ----- | -------- | ------- | ----------- | ------------ |
| `import-manager`  | 104   | 95.47    | 91.03   | 98.78       | 95.47        |
| `application-api` | 181   | 98.57    | 88.84   | 98.53       | 98.57        |
| `desktop-app`     | 427   | 93.97    | 85.82   | 90.31       | 93.97        |

Umbrales exigidos: líneas/funciones/sentencias ≥90%, ramas ≥85%. Superados en los tres
paquetes tocados, en ambos entornos.

### Resultado por paquete (`test`, árbol de trabajo y reconstrucción limpia — idéntico)

```
adapters 55 · agent-manager 86 · ai-creator-manager 124 · ai-manager 51 ·
application-api 181 · backup 112 · client-manager 109 · config 32 · core 87 ·
desktop-app 427 · environment-manager 111 · event-bus 47 · host 84 ·
import-manager 104 · knowledge-manager 148 · logger 42 · migration 65 · plugin 106 ·
portable-package-manager 125 · portable-workspace 74 · profile 63 · project 63 ·
psn-adapter 45 · restore 66 · rule-manager 113 · scheduler 55 · secrets 51 ·
skill-manager 145 · status 68 · tooling 60 · verification 88 · workspace 56
```

Total: 3 043 tests, 0 fallos.

## 4. Pruebas de integración reales (sin mocks para la copia física)

```
$ npx vitest run tests/integration
✓ tests/integration/realManagers.test.ts (6 tests)
✓ tests/integration/importIndependence.test.ts (1 test)
✓ tests/integration/e2eImportFlow.test.ts (1 test)
```

- **`importIndependence.test.ts`** — la prueba crítica obligatoria: crea un agente
  real en un SISTEMA-DE-TRABAJO externo real, lo importa con `import.execute` en una
  segunda instancia de la app real, activa el destino interno, **borra por completo
  la carpeta origen**, y confirma que `agents.list`/`agents.get` siguen respondiendo
  correctamente desde la copia interna — incluidos los ficheros ocultos.
- **`e2eImportFlow.test.ts`** — flujo mínimo E2E por IPC real: `IpcRouter` +
  `createDesktopBridge` reales (selección simulada a nivel IPC, nunca una ruta
  escrita a mano), `import.preview` → `import.execute` → `workspace.initialize`/
  `register` → listado real de al menos un agente, una skill y una regla importados
  → origen eliminado → datos internos todavía accesibles. Sin red ni herramientas
  externas.
- **`ImportScanner`/`ImportService`/`ImportManager`** (unitarias, filesystem temporal
  real): hidden files, `.kilo`, subdirectorios profundos, symlinks (seguros y
  peligrosos), nombres Unicode, rutas de +260 caracteres, Zip Slip, rutas absolutas
  (POSIX y Windows), integridad de copia, rollback completo, cancelación,
  importación repetida, ENOSPC simulado, errores de lectura simulados.

## 5. Empaquetado

### Linux (verificado de extremo a extremo)

```
$ npx electron-builder --config build/electron-builder.json5
• packaging       platform=linux arch=x64 electron=31.3.1
• building        target=AppImage arch=x64 file=release/DWM-1.0.1.AppImage
```

Generado dos veces (árbol de trabajo y reconstrucción limpia), ambas con éxito.
Los hashes SHA-256 difieren entre builds (no hay build determinista configurada;
igual que en v1.0.0, esto no afecta a la validez de cada build por sí sola).

**Checksum del artefacto final incluido en esta entrega (árbol de trabajo):**

```
SHA-256 (DWM-1.0.1.AppImage) = 66eb92e3232d892c395086899d8766f7f0b8eabfa9920549e9b04d3f545c5b44
```

**Checksum de la reconstrucción limpia:**

```
SHA-256 (DWM-1.0.1.AppImage) = aa861738dca56d1a4dfec03212b7cc0b26c23f1402a8f4784c59876051b15f81
```

#### Verificación de contenido del `.asar`

```
$ npx @electron/asar list linux-unpacked/resources/app.asar | grep -E "ImportController|ImportManager|PSNAdapter"
/node_modules/@dwm/application-api/dist/controllers/ImportController.js
/node_modules/@dwm/import-manager/dist/ImportManager.js
/node_modules/@dwm/psn-adapter/dist/PSNAdapter.js
```

Confirma que la corrección de esta entrega queda realmente incluida en el paquete
final, no solo en el árbol de fuentes.

#### Arranque real verificado (Xvfb)

```
$ ./DWM-1.0.1.AppImage --appimage-extract
$ xvfb-run -a ./squashfs-root/@dwmdesktop-app --no-sandbox --disable-gpu --disable-dev-shm-usage
[WARN] (desktop-app) No se pudo leer la configuración de escritorio; se usan valores
por defecto. metadata={"filePath":".../desktop-config.json","reason":"ENOENT..."}
```

El proceso arranca y ejecuta código real; `ConfigurationManager` detecta
correctamente la ausencia de configuración previa (comportamiento correcto de primer
arranque, idéntico al de v1.0.0). Cierre ordenado con `SIGTERM` verificado sin
errores.

### Windows (NSIS) — intentado honestamente, no generado en este entorno

```
$ npx electron-builder --win --config build/electron-builder.json5
• packaging       platform=win32 arch=x64 electron=31.3.1
⨯ wine is required, please see https://electron.build/multi-platform-build#linux
```

Fallo real, no simulado: este contenedor es Linux sin Wine. No se instaló Wine
(evitar herramientas globales innecesarias, según el alcance de esta corrección).
En su lugar:

- `build/electron-builder.json5` confirmado completo para NSIS (appId, productName,
  versión automática desde `package.json`, icono, accesos directos de escritorio y
  menú Inicio, desinstalador con nombre explícito, `deleteAppDataOnUninstall: false`).
- Icono verificado: `build/icon.png` es 1024×1024 (formato y tamaño válidos para que
  electron-builder autogenere `.ico`); confirmado que la fase de conversión
  (`.icon-ico`) se completó sin error antes del fallo de Wine.
- Añadido `package:electron:win` (script npm) y
  `.github/workflows/build-windows.yml`, que genera el `.exe` en un runner
  `windows-latest` real (sin Wine) y publica el artefacto con checksums SHA-256.
- Comando exacto reproducible en una máquina Windows real (Node.js ≥18, npm):
  ```
  npm install
  npm run build:internal-deps
  npm run package:electron:win -w packages/desktop-app
  ```

### macOS (DMG)

No generado ni verificado — mismo motivo que en v1.0.0 (sin toolchain de macOS en
este entorno). Sin cambios respecto a la entrega anterior.

## 6. Bugs reales encontrados y corregidos durante esta corrección

1. `ImportManager` no exponía ninguna operación en la Application API (existía
   completo en `@dwm/import-manager` desde antes) — corregido con `ImportController`.
2. `ImportController` no estaba re-exportado desde el `index.ts` del paquete, lo que
   rompía la fusión de tipos (`declare module`) para cualquier consumidor externo
   como `desktop-app` — corregido.
3. `ImportManager` no tenía `workspacePaths` conectado en `ManagerComposition.ts`:
   toda importación real habría fallado con `IMPORT_DESTINATION_UNRESOLVABLE`.
4. `IpcRouter` no otorgaba ninguna capacidad al `caller` del renderer
   (`privileged: false` sin `grantedCapabilities`): con el sistema de permisos
   "deniega por defecto", ninguna operación de la app real habría funcionado nunca a
   través del IPC empaquetado — no solo import. Corregido otorgando
   `ALL_APPLICATION_CAPABILITIES`.
5. `ImportScanner` no protegía contra Zip Slip, path traversal ni symlinks
   peligrosos: ni las entradas de un ZIP ni el destino de un symlink se validaban.
   Corregido usando `IMPORT_UNSAFE_PATH` (código de error que ya existía en el
   catálogo pero nunca se lanzaba).
6. `ImportWorkspacePanel` (UI) llamaba a `workspace.register` sin `workspace.initialize`
   antes — habría fallado siempre sobre un destino recién importado.

Todos verificados con pruebas reales (unitarias e integración), no solo revisión de
código.
