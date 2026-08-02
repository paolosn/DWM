# Dev Workspace Manager (DWM) — v1.0.2

## Propósito

DWM reconstruye automáticamente un entorno de desarrollo completo en Windows, macOS y
Linux a partir de una única carpeta gestionada por el propio sistema:
`SISTEMA-DE-TRABAJO`. Gestiona agentes, skills, reglas, conocimiento, clientes y
proyectos; crea y restaura backups; empaqueta y desempaqueta Workspaces portables; y
expone todo esto a través de una aplicación de escritorio (Electron + React +
TypeScript) sobre una Application API tipada y estable.

El diseño original del sistema está fijado en dos documentos de referencia:

- [`docs/adr/ADR-001-DWM-Arquitectura.md`](docs/adr/ADR-001-DWM-Arquitectura.md) —
  arquitectura oficial (módulos, adaptadores, principios de diseño).
- [`docs/frs/FRS-001-DWM-Especificacion-Funcional.md`](docs/frs/FRS-001-DWM-Especificacion-Funcional.md) —
  especificación funcional oficial.

## Estado de esta entrega (v1.0.2)

Corrección de estabilización sobre v1.0.1, con alcance cerrado a dos problemas: el
Workspace importado ahora **se recupera automáticamente al reabrir DWM** (antes,
`composeManagers()` solo buscaba el Workspace hacia arriba desde `dataDir`, y nunca
podía encontrar uno importado en `<dataDir>/workspace/<nombre>`, que es una
subcarpeta); y el instalador Windows (NSIS) quedó revisado y confirmado completo. Ver
[`RELEASE-NOTES-v1.0.2.md`](RELEASE-NOTES-v1.0.2.md) para el detalle completo.

Todo lo demás hereda el estado de v1.0.1: Core, Application API, los managers de
dominio (Agent, Skill, Rule, Knowledge, Client, Project, Environment, Profile, Plugin,
Backup, Restore, Verification, Status, Migration, Portable Package, AI Creator,
Import, PSN Adapter, Portable Workspace, Config, Event Bus) y la aplicación de
escritorio completa (21 pantallas: Inicio, Centro de trabajo, Proyectos, Agentes,
Skills, Reglas, Conocimiento, Clientes, Perfiles, Workspaces, AI Creator, IA,
Herramientas, Plugins, Paquetes, Backups, Estado, Logs, Configuración, Ayuda, Acerca
de DWM) están integrados de extremo a extremo: la Desktop App conecta managers reales
(no simulados), verificado con pruebas de integración reales
(`packages/desktop-app/tests/integration`) contra el sistema de archivos real, sin
mocks.

Ver [`LIMITATIONS-v1.0.2.md`](LIMITATIONS-v1.0.2.md) para el listado exacto de lo que
no está disponible todavía y por qué, y [`RELEASE-NOTES-v1.0.2.md`](RELEASE-NOTES-v1.0.2.md)
para el detalle de esta entrega ([`RELEASE-NOTES-v1.0.1.md`](RELEASE-NOTES-v1.0.1.md)
para la anterior).

## Requisitos del sistema

- Node.js ≥ 18 y npm ≥ 9 (desarrollo/build).
- Para ejecutar la app empaquetada: Windows 10+, macOS 11+ o Linux con soporte de
  AppImage/FUSE (o extracción manual con `--appimage-extract` si FUSE no está
  disponible, p. ej. en algunos contenedores).
- ~300 MB de espacio en disco para la app empaquetada; más si se usan backups locales.

## Instalación para desarrollo

```bash
npm install                        # en la raíz del monorepo (workspaces npm)
npm run build:internal-deps        # compila los paquetes de dominio (Módulos 1-31)
```

## Ejecución en desarrollo

```bash
cd packages/desktop-app
npm run dev:renderer                # servidor Vite del renderer
# en otra terminal, con DWM_DESKTOP_DEV_SERVER_URL apuntando al servidor de Vite:
# (ver src/main/index.ts)
```

## Build

```bash
cd packages/desktop-app
npm run build        # build:renderer (Vite) + build:main (tsc)
```

## Verificación

```bash
cd packages/desktop-app
npm run typecheck
npx eslint .          # desde la raíz del monorepo
npm run test:coverage
npm run build
npx vitest run tests/integration   # pruebas de integración reales, sin mocks
```

## Empaquetado

```bash
cd packages/desktop-app
npx electron-builder --config build/electron-builder.json5 --linux AppImage
# Windows (NSIS): npm run package:electron:win, o el workflow reproducible en
# .github/workflows/build-windows.yml (requiere Wine si se ejecuta en Linux, o un
# runner/máquina Windows real). --mac requiere macOS. Ver LIMITATIONS-v1.0.2.md §2.
```

El icono en `packages/desktop-app/build/icon.png` es un **placeholder** generado
programáticamente: sustituir por el arte final de marca antes de distribuir.

## Estructura del producto

```
packages/
  core, event-bus, config, logger, secrets, ...        # infraestructura común
  workspace, portable-workspace, import-manager,
  psn-adapter, migration                                # Workspace e importación
  agent-manager, skill-manager, rule-manager,
  knowledge-manager, client-manager, project             # recursos PSN
  environment-manager, portable-package-manager,
  ai-creator-manager, backup, restore, verification,
  status, profile, plugin                                # capacidades del producto
  application-api                                        # capa pública única (Módulo 31)
  desktop-app                                             # Electron + React (Módulos 32-34)
    src/main       — proceso principal (bootstrap, IPC, composición de managers)
    src/preload    — puente contextBridge, superficie mínima autorizada
    src/renderer   — React: design system, framework de entidades, pantallas
    tests/unit          — pruebas unitarias (mocks)
    tests/integration   — pruebas de integración reales (sin mocks)
```

## Cómo importar SISTEMA-DE-TRABAJO

Desde **Onboarding** (paso «Workspace»), dos vías reales:

- **Importar carpeta / Importar ZIP** (nuevo en v1.0.1): abre el selector nativo del
  sistema operativo, previsualiza origen/destino/archivos/ocultos/tamaño/conflictos
  (`import.inspect` + `import.preview`), pide aprobación explícita, y copia
  físicamente el contenido dentro del Workspace interno de DWM (`import.execute`) —
  el origen nunca se modifica ni queda como dependencia. Tras importar, se reescanea
  automáticamente con PSN Adapter y se muestra un resumen con los recursos
  detectados.
- **Crear Workspace vacío**: introduce la ruta de un `SISTEMA-DE-TRABAJO` existente (o
  una carpeta vacía) y pulsa «Inicializar y activar» (`workspace.initialize` +
  `workspace.register`). A diferencia de la importación, aquí el Workspace activo
  **es** la ruta indicada — no hay copia física.

Ver la limitación sobre re-escaneo en caliente y persistencia entre reinicios en
`LIMITATIONS-v1.0.1.md` §1 y §3.

## Cómo crear el primer paquete portable

Desde **Paquetes**: indica una ruta destino y, opcionalmente, una raíz distinta a la
del Workspace activo, y pulsa «Crear paquete» (`packages.create` real). Para
inspeccionar un paquete existente, indica la ruta del `.zip` y pulsa «Inspeccionar»
(`packages.inspect` + `packages.list-contents` + `packages.validate` reales).

## Backup y restauración

Desde **Backups**: «Crear backup» especifica tipo, un recurso y una ruta **relativa**
de destino (se resuelve de forma segura dentro del directorio de datos de la app,
protegido contra path traversal). «Restaurar» ofrece siempre un modo de prueba
(dry-run) real antes de una restauración definitiva. No hay cancelación de backups en
curso: la operación pública no existe todavía.

## Seguridad de secretos

Ningún secreto se registra en logs, errores ni eventos: `ApplicationErrorMapper`
redacta cualquier campo cuya clave coincida con un patrón de credencial antes de que
la respuesta salga de Application API. El renderer nunca accede a Node, al sistema de
archivos ni a procesos directamente (`contextIsolation: true`, `nodeIntegration:
false`, `sandbox: true`, preload con superficie mínima vía `contextBridge`).

## Tecnologías y versiones

Electron ^31.3.1 · React ^18.3.1 · TypeScript ^5.5.4 · Vite ^5.4.0 · Node.js ≥18 ·
electron-builder ^24.13.3. Ver «Acerca de DWM» en la propia aplicación para las
versiones reales en ejecución (no hardcodeadas: se leen de `window.dwm.getVersionInfo()`).

## Guía de diagnóstico

1. Abre **Acerca de DWM** y pulsa «Copiar diagnóstico» — copia al portapapeles
   versión de la app, de Application API, Electron, Chrome, Node.js, plataforma y
   Workspace activo (JSON, sin secretos).
2. Revisa **Estado** para ver advertencias/errores por módulo y ejecutar una
   verificación completa (`verification.run`).
3. Para un fallo de integración concreto, revisa
   `packages/desktop-app/tests/integration/realManagers.test.ts` como referencia de
   comportamiento esperado contra managers reales.

## Matriz de operaciones disponibles / no disponibles

Ver [`LIMITATIONS-v1.0.1.md`](LIMITATIONS-v1.0.1.md).

## Licencia

Sin licencia pública definida todavía para esta entrega (`UNLICENSED` a nivel de
`package.json`).
