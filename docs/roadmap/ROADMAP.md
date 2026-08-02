# Roadmap — Dev Workspace Manager (DWM)

Este documento refleja el estado **real y verificado** del proyecto. Nada se marca
como completado a menos que esté implementado y comprobado mediante `npm run verify`.

---

## COMPLETADO

- **ADR-001** — Arquitectura Oficial del Proyecto (`docs/adr/ADR-001-DWM-Arquitectura.md`).
- **FRS-001** — Especificación Funcional Oficial (`docs/frs/FRS-001-DWM-Especificacion-Funcional.md`).
- **Estructura raíz del repositorio** — monorepo `npm workspaces` (`packages/`,
  `adapters/`, `apps/`, `scripts/`, `tests/integration/`, `docs/`), con scripts raíz
  (`build`, `typecheck`, `lint`, `format:check`, `test`, `test:coverage`, `verify`)
  que recorren todos los paquetes del workspace.
- **DWM Core** (`packages/core`, paquete `@dwm/core`) — núcleo consolidado y
  endurecido:
  - Ciclo de vida determinista con guardas explícitas por operación.
  - Registro atómico de módulos y adaptadores (validación → init → commit, sin
    residuos si `init()` falla).
  - Unicidad de `subjectId` entre adaptadores.
  - Política de baja segura y de apagado ordenado con agregación de fallos
    (`ShutdownReport`).
  - Política de reinicialización explícita (`ERROR` y `STOPPED` permiten reintentar;
    doble inicialización e inicialización concurrente se rechazan).
  - Namespace de eventos `core:*` cerrado y protegido frente a módulos externos
    (`ScopedEventBus`).
  - Validación estricta de versión semántica para `version` y `contractVersion`.
  - Inmutabilidad de toda estructura devuelta por la API pública.
  - Suite de pruebas (`vitest`) con 87 pruebas y cobertura verificada por encima de
    los umbrales exigidos (90% líneas / 90% funciones / 85% ramas / 90% sentencias).
- **Agent Manager** (`packages/agent-manager`, paquete `@dwm/agent-manager`) — primer
  gestor funcional de DWM:
  - Lista, lee, crea, edita, duplica, elimina, archiva y restaura los agentes reales
    del Workspace (ficheros del recurso `agents` ya reconocido por `@dwm/psn-adapter`),
    trabajando directamente sobre el sistema de ficheros: sin base de datos propia ni
    duplicación de información.
  - Archivar/restaurar reescribe metadatos gestionados dentro del propio fichero del
    agente (clave reservada `__dwm`); nunca mueve ni renombra nada.
  - Validación de identificadores, de datos y de estructura completa (`AgentValidator`).
  - Consulta de metadatos, búsqueda y filtrado sobre un índice en memoria
    (`AgentRegistry`) reconstruido desde el `AgentRepository`.
  - Integración con `@dwm/psn-adapter` (obligatoria, para resolver el directorio real
    de agentes), y opcional con `@dwm/workspace`, `@dwm/portable-workspace`,
    `@dwm/import-manager`, `@dwm/verification` y `@dwm/status`.
  - Suite de pruebas (`vitest`) con 86 pruebas y cobertura por encima de los umbrales
    exigidos (90% líneas / 90% funciones / 85% ramas / 90% sentencias).
- **Skill Manager** (`packages/skill-manager`, paquete `@dwm/skill-manager`) — gestiona
  las skills reales del Workspace:
  - Lista, lee, crea, edita, guarda, duplica (carpeta completa: `SKILL.md`,
    subcarpetas, plantillas, scripts y recursos ocultos), archiva, restaura, elimina
    (de forma explícita e irreversible, requiriendo `confirmPermanent: true`), busca,
    filtra y valida estructura sobre las carpetas reales del recurso `skills` ya
    reconocido por `@dwm/psn-adapter` (cada skill = una carpeta con su `SKILL.md`).
  - Sin base de datos, sin duplicar información; nunca mueve ni reorganiza una
    carpeta salvo lo explícitamente solicitado (crear, duplicar o eliminar).
  - Archivar/restaurar reescribe únicamente el bloque `dwm:` reservado del
    frontmatter de `SKILL.md` (parser propio en `SkillFrontmatter`, sin dependencias
    externas), preservando el resto del frontmatter y el cuerpo del autor intactos.
  - Detecta `SKILL.md` ausente o estructuralmente inválido sin lanzar
    (`detectSkillFileIssue`), y permite repararlo editando la skill.
  - Listado y lectura segura de archivos auxiliares (incluidos ocultos), con
    protección explícita frente a path traversal.
  - Integración con `@dwm/psn-adapter` (obligatoria) y opcional con
    `@dwm/workspace`, `@dwm/portable-workspace`, `@dwm/import-manager`,
    `@dwm/verification` y `@dwm/status`. Sin dependencia de `@dwm/agent-manager`: no
    se identificó ninguna relación pública útil que no fuera un acoplamiento
    artificial entre agentes y skills.
  - Suite de pruebas (`vitest`) con 145 pruebas y cobertura por encima de los
    umbrales exigidos (90% líneas / 90% funciones / 85% ramas / 90% sentencias).
- **Rule Manager** (`packages/rule-manager`, paquete `@dwm/rule-manager`) — gestiona
  las reglas reales del Workspace:
  - Lista, lee, crea, edita, guarda, duplica, archiva, restaura, elimina, busca,
    filtra, valida estructura y consulta metadatos sobre los ficheros Markdown
    reales del recurso `rules` ya reconocido por `@dwm/psn-adapter` (cada regla =
    un fichero `.md` de primer nivel, análogo a los agentes pero con contenido
    Markdown en vez de JSON).
  - Sin base de datos, sin duplicar información; nunca mueve ni renombra ficheros.
  - Archivar/restaurar reescribe únicamente el bloque `dwm:` reservado del
    frontmatter (parser propio en `RuleFrontmatter`, sin dependencias externas),
    preservando el resto del frontmatter y el cuerpo del autor intactos.
  - Integración con `@dwm/psn-adapter` (obligatoria) y opcional con
    `@dwm/workspace`, `@dwm/portable-workspace`, `@dwm/import-manager`,
    `@dwm/agent-manager`, `@dwm/skill-manager`, `@dwm/verification` y
    `@dwm/status`.
  - Suite de pruebas (`vitest`) con 113 pruebas y cobertura por encima de los
    umbrales exigidos (90% líneas / 90% funciones / 85% ramas / 90% sentencias).

---

## PENDIENTE

- **Módulos funcionales**: Tooling Manager, AI Manager, Secrets Manager, Profile
  Manager (gestión completa), Project Manager, Plugin Manager, Backup Manager, Restore
  Manager, Migration Manager, Verification Manager, Log Manager, Status Manager.
- **Adaptadores de sistema operativo**: Windows, macOS, Linux.
- **Adaptadores de herramientas**: Git, VS Code, Kilo Code, Cline, Continue, Cursor,
  Roo, GitLens, Copilot, Ollama, DeepSeek, y cualesquiera otras herramientas que se
  incorporen.
- **Aplicación / panel**: interfaz de usuario (Dashboard y el resto de FRS-001),
  tecnología de interfaz aún no decidida.
- **Empaquetado**: distribución instalable en Windows, macOS y Linux.
- **Migración final a USB**: flujo de portabilidad completa del entorno vía
  dispositivo USB, descrito como objetivo a largo plazo.
