# Informe de build — DWM v1.0.0

Ejecutado en un contenedor Linux x86_64, Node.js instalado vía npm workspaces, sin
acceso a Windows/macOS ni a un servidor gráfico persistente. Todos los comandos y
resultados de este informe son reales, ejecutados en esta entrega — ninguno está
inventado ni asumido.

## 1. Instalación desde cero (directorio vacío)

```
$ npm install --no-audit --no-fund
added 577 packages in 30s
```

## 2. Build de módulos internos congelados

```
$ npm run build:internal-deps
```

30 paquetes compilados (`tsc -p tsconfig.json` por paquete): core, logger, event-bus,
scheduler, config, secrets, ai-manager, adapters, workspace, tooling, profile, project,
plugin, backup, restore, migration, verification, status, portable-workspace,
import-manager, psn-adapter, agent-manager, skill-manager, rule-manager,
knowledge-manager, client-manager, environment-manager, portable-package-manager,
ai-creator-manager, application-api. Sin errores.

## 3. Cinco fases de verificación — resultado idéntico en árbol de trabajo y en

reconstrucción limpia

| Fase                       | `desktop-app`                                                                                    | `application-api`                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `format:check` (prettier)  | ✅                                                                                               | ✅                                                                                             |
| `lint` (eslint)            | ✅ 0 problemas                                                                                   | ✅ 0 problemas                                                                                 |
| `typecheck` (tsc estricto) | ✅                                                                                               | ✅                                                                                             |
| `test:coverage`            | ✅ 99 archivos / 417 tests — 94.56% líneas · 86.53% ramas · 90.94% funciones · 94.56% sentencias | ✅ 30 archivos / 170 tests — 98.9% líneas · 89.36% ramas · 98.47% funciones · 98.9% sentencias |
| `build` (vite + tsc)       | ✅ 222 módulos, `index-DkAOnJ8Q.js` 261.76 kB (73.51 kB gzip)                                    | —                                                                                              |

Umbrales exigidos: líneas/funciones/sentencias ≥90%, ramas ≥85%. Superados en ambos
paquetes, en ambos entornos (árbol de trabajo y reconstrucción limpia).

## 4. Pruebas de integración reales (sin mocks)

```
$ npx vitest run tests/integration
✓ tests/integration/realManagers.test.ts (6 tests)
```

Contra `EngineBootstrap` con managers reales y sistema de archivos real en un
directorio temporal: arranque sin Workspace (error normalizado, sin crash); ciclo
completo de un agente (crear → listar → archivar → restaurar → eliminar) contra disco
real; creación de backup real con `LocalBackupProvider`; rechazo de path traversal;
rechazo de eliminación destructiva sin `confirmation:true`; ausencia de detalles
internos (stack traces, rutas de `node_modules`) en una operación desconocida.

## 5. Empaquetado (Linux — único verificable en este entorno)

```
$ npx electron-builder --config build/electron-builder.json5 --linux AppImage
• packaging       platform=linux arch=x64 electron=31.3.1
• building        target=AppImage arch=x64 file=release/DWM-1.0.0.AppImage
```

Generado dos veces (árbol de trabajo y reconstrucción limpia): ambas veces con éxito,
ambos artefactos de ~104 MB. Los hashes SHA-256 difieren entre ambas builds (no hay
build determinista configurada); esto no afecta a la validez de la verificación, cada
build es correcta por sí sola.

**Checksum del artefacto final incluido en esta entrega:**

```
SHA-256 (DWM-1.0.0.AppImage) = d7d87f55fe788bbc4b4a8046a814e12ff7b7621470ae0e07ec6ff95631645c99
```

### Verificación de contenido del paquete

```
$ npx @electron/asar list app.asar | grep @dwm/agent-manager/dist/AgentManager.js
/node_modules/@dwm/agent-manager/dist/AgentManager.js
```

Confirma que los managers de dominio quedan incluidos en el `.asar` final (bug real
corregido en esta entrega: `package.json` de `desktop-app` no los declaraba como
dependencias).

### Arranque real verificado

```
$ ./DWM-1.0.0.AppImage --appimage-extract
$ xvfb-run -a ./squashfs-root/@dwmdesktop-app --no-sandbox --disable-gpu --disable-dev-shm-usage
[WARN] (desktop-app) No se pudo leer la configuración de escritorio; se usan valores
por defecto. metadata={"filePath":".../desktop-config.json","reason":"ENOENT..."}
```

El proceso arranca, el motor compone los managers reales, `ConfigurationManager`
detecta correctamente la ausencia de configuración previa y usa valores por defecto
(comportamiento correcto de primer arranque). Verificado en ambas builds (árbol de
trabajo y reconstrucción limpia). FUSE no está disponible en este contenedor: se usó
`--appimage-extract` para verificar el contenido sin AppImage montado.

### No generado en esta entrega

Windows (NSIS) y macOS (DMG): configuración completa en `electron-builder.json5`, pero
no generados ni verificados — este entorno de build es Linux sin Wine ni toolchain de
macOS. Ver `LIMITATIONS-v1.0.0.md` §4.

## 6. Bugs reales encontrados y corregidos durante este módulo

1. `EngineBootstrap` no conectaba ningún manager de dominio (placeholder del
   Módulo 32 nunca resuelto) — corregido con `ManagerComposition.ts`.
2. `workspace.initialize`/`workspace.register` existían en el manager pero nunca se
   habían expuesto en Application API — conectadas.
3. `createFakeLogger()` (doble de prueba) no implementaba `.child()`/
   `.withCorrelationId()` de la clase real `Logger`; cualquier manager real que los
   llamara producía un `TypeError` crudo enmascarado como "error interno" — corregido.
4. `PortableWorkspaceManager.initializeWorkspace()` no crea la estructura heredada
   (`.kilo/agents`, etc.) que `PSNAdapter.scanWorkspace()` necesita — corregido con
   `ensurePsnSkeleton()`, sin duplicar lógica de escaneo.
5. `package.json` de `desktop-app` no declaraba ~20 dependencias de managers
   realmente usadas en tiempo de ejecución — corregido; confirmado con el `.asar`
   real.

Todos verificados con pruebas de integración reales, no solo revisión de código.
