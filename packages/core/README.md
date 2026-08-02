# @dwm/core

Núcleo de **Dev Workspace Manager (DWM)**.

Este documento describe el diseño interno del Core y sirve como guía de lectura del código.
Implementa exclusivamente lo definido en [ADR-001](../../docs/adr/ADR-001-DWM-Arquitectura.md) y
[FRS-001](../../docs/frs/FRS-001-DWM-Especificacion-Funcional.md). No contiene lógica específica
de sistema operativo ni de ninguna herramienta externa (Git, VS Code, Kilo Code, Ollama, DeepSeek,
Cursor, Continue, etc.). Esa lógica pertenece a módulos y adaptadores externos que se conectarán al
Core en fases posteriores, sin necesidad de modificarlo.

Estado: **cerrado y congelado** en esta fase (consolidación del Core). Ningún módulo funcional,
adaptador real, ni interfaz de usuario forma parte de este paquete.

---

## Índice

1. Responsabilidades
2. Arquitectura interna
3. Organización de carpetas
4. Ciclo de vida
5. Flujo de inicialización
6. Reinicialización
7. Sistema de eventos
8. Registro de módulos (atomicidad)
9. Registro de adaptadores (atomicidad y unicidad de subjectId)
10. Baja segura (dispose)
11. Apagado ordenado
12. Gestión de errores
13. Gestión del estado e inmutabilidad
14. Guardas de ciclo de vida
15. API pública del Core
16. Contratos internos
17. Límites explícitos del Core (qué NO hace)
18. Pruebas y cobertura

---

## 1. Responsabilidades

El Core es responsable, y únicamente responsable, de:

- Inicializar el sistema (bootstrap) siguiendo un flujo determinista y verificable.
- Cargar la configuración normalizada (`ConfigManager`).
- Cargar el descriptor del perfil activo (`ProfileLoader`).
- Mantener el registro atómico de módulos (`ModuleRegistry`).
- Mantener el registro atómico de adaptadores (`AdapterRegistry`).
- Proveer el sistema de eventos (`EventBus`) que usan todos los módulos para comunicarse
  de forma desacoplada, con un namespace `core:*` cerrado y protegido.
- Coordinar el ciclo de vida global de la aplicación (arranque, ejecución, apagado,
  reinicialización).
- Centralizar la gestión de errores y exponer el estado agregado del sistema de forma
  inmutable.

El Core **no ejecuta** lógica de negocio de ningún módulo concreto (Tooling Manager,
AI Manager, Secrets Manager, etc.). Su única función es orquestar su carga y su ciclo
de vida, y ofrecerles infraestructura común (eventos, errores, estado, registro).

## 2. Arquitectura interna

El Core se organiza en seis subsistemas independientes, coordinados por una fachada
única: `DWMCore`.

```
DWMCore (fachada / orquestador)
 ├── ConfigManager     → configuración normalizada
 ├── ProfileLoader      → perfil activo
 ├── ModuleRegistry     → módulos registrados (atómico)
 ├── AdapterRegistry    → adaptadores registrados (atómico, unicidad de subjectId)
 ├── EventBus           → comunicación desacoplada (namespace core:* cerrado)
 └── StateManager       → snapshot agregado de estado del sistema (inmutable)
```

`DWMCore` no implementa lógica propia de cada subsistema; delega en ellos y expone una
API pública estable (sección 15). Ningún subsistema conoce a los demás directamente;
toda coordinación pasa por `DWMCore`.

## 3. Organización de carpetas

```
packages/core/
├── README.md
├── package.json
├── tsconfig.json              # Compilación de src/ (hereda de tsconfig.base.json)
├── tsconfig.typecheck.json    # Typecheck combinado de src/ + tests/
├── vitest.config.ts           # Configuración de pruebas y umbrales de cobertura
├── src/
│   ├── index.ts                  # Punto de entrada público del paquete
│   ├── core/
│   │   ├── DWMCore.ts             # Fachada / orquestador principal
│   │   ├── LifecycleState.ts      # Estados y transiciones del ciclo de vida
│   │   └── ShutdownReport.ts      # Informe agregado de fallos de apagado
│   ├── events/
│   │   ├── EventBus.ts            # Bus de eventos interno + ScopedEventBus
│   │   └── EventTypes.ts          # Catálogo cerrado de eventos core:*
│   ├── errors/
│   │   ├── DWMError.ts            # Clase base de error del sistema
│   │   └── ErrorCodes.ts          # Catálogo cerrado de códigos de error
│   ├── status/
│   │   └── SystemStatus.ts        # Estados de FRS-001 §15 (vocabulario compartido)
│   ├── config/
│   │   ├── types.ts                       # Tipos de configuración normalizada
│   │   ├── StorageProvider.ts             # Contrato de almacenamiento (inyectable)
│   │   ├── FileSystemStorageProvider.ts   # Implementación genérica sobre ficheros
│   │   └── ConfigManager.ts               # Carga/guardado de configuración normalizada
│   ├── profile/
│   │   ├── types.ts               # Tipos de perfil (descriptor mínimo)
│   │   └── ProfileLoader.ts       # Carga del perfil activo
│   ├── registry/
│   │   ├── ModuleRegistry.ts      # Registro atómico de módulos
│   │   ├── AdapterRegistry.ts     # Registro atómico de adaptadores
│   │   └── validation.ts          # Validación de identidad y de semver
│   ├── contracts/
│   │   ├── IModule.ts             # Contrato que debe cumplir todo módulo + ModuleContext
│   │   └── IAdapter.ts            # Contrato que debe cumplir todo adaptador
│   └── state/
│       ├── StateManager.ts        # Agregación interna de estado del sistema
│       └── immutable.ts           # Copia defensiva profunda (deepFreezeClone)
└── tests/
    ├── support/doubles.ts                 # Dobles de prueba compartidos (sin servicios externos)
    ├── lifecycle.test.ts                  # Arranque, config, perfil, reinicialización, guardas
    ├── modules.test.ts                    # Registro atómico de módulos
    ├── adapters.test.ts                   # Registro atómico de adaptadores
    ├── events.test.ts                     # EventBus y ScopedEventBus
    ├── state.test.ts                      # Estado agregado e inmutabilidad
    ├── shutdown.test.ts                   # Apagado ordenado y agregación de fallos
    ├── configManager.test.ts              # ConfigManager (unitario)
    ├── profileLoader.test.ts              # ProfileLoader (unitario)
    ├── fileSystemStorageProvider.test.ts  # Implementación de referencia sobre ficheros
    ├── validation.test.ts                 # Validación de identidad y semver (unitario)
    ├── dwmError.test.ts                   # DWMError (unitario)
    ├── stateManager.test.ts               # StateManager (unitario)
    ├── immutable.test.ts                  # deepFreezeClone (unitario)
    └── publicApi.test.ts                  # Superficie pública (src/index.ts) end-to-end
```

Esta estructura es estable: incorporar módulos, adaptadores o herramientas reales en el
futuro no requiere modificar ninguna carpeta existente, solo añadir nuevos paquetes que
consuman la API pública del Core (sección 15) y cumplan los contratos (sección 16).

## 4. Ciclo de vida

El Core modela su ciclo de vida como una máquina de estados finita:

```
UNINITIALIZED
   → BOOTSTRAPPING
   → LOADING_CONFIG
   → LOADING_PROFILE
   → LOADING_REGISTRIES
   → READY
   → RUNNING
   → SHUTTING_DOWN
   → STOPPED  ─┐
               │ (reinicialización explícita, sección 6)
   ERROR      ─┤
               │
               └──→ BOOTSTRAPPING
```

En cualquier punto del arranque, un fallo no recuperable transiciona el sistema al
estado `ERROR`, del cual no se puede volver a `RUNNING` sin una reinicialización
explícita. Tanto `ERROR` como `STOPPED` admiten como única transición de salida un
nuevo `BOOTSTRAPPING` (sección 6); el resto de transiciones son unidireccionales y
están validadas por una tabla explícita en `LifecycleState.ts`
(`isTransitionAllowed(from, to)`). Cualquier transición fuera de esa tabla lanza
`DWMError` (`INVALID_LIFECYCLE_TRANSITION`).

## 5. Flujo de inicialización

`DWMCore.initialize()` ejecuta, en este orden estricto, sin paralelismo entre pasos:

1. **BOOTSTRAPPING** — se valida que las dependencias inyectadas (proveedor de
   almacenamiento) sean válidas y que la reinicialización sea procedente (sección 6).
   Se emite `core:lifecycle-changed`.
2. **LOADING_CONFIG** — `ConfigManager.load()` carga la configuración normalizada desde
   el proveedor de almacenamiento. Si no existe, se crea configuración por defecto
   (comportamiento de primera ejecución, FRS-001 §1.4). Se emite `core:config-loaded`.
3. **LOADING_PROFILE** — `ProfileLoader.loadActiveProfile()` determina el perfil activo
   según la configuración cargada. Si no existe ningún perfil, el Core queda en un
   estado válido sin perfil activo (`activeProfile = null`), reflejado como `PENDING`
   (FRS-001 §15), sin considerarse un error. Se emite `core:profile-loaded`.
4. **LOADING_REGISTRIES** — `ModuleRegistry` y `AdapterRegistry` (recreados desde cero
   si se trata de una reinicialización) quedan listos para recibir registros externos.
   Se emite `core:registries-ready`.
5. **READY** — el Core queda operativo y expone su API pública para que otros paquetes
   registren módulos y adaptadores. Se emite `core:ready`.
6. **RUNNING** — transición explícita (`markRunning()`), invocada una vez que el
   proceso host considera que la aplicación está sirviendo al usuario. Se emite
   `core:running`.

Cualquier excepción durante los pasos 1-4 se captura, se envuelve en `DWMError`, se
emite como `core:error` y transiciona el ciclo de vida a `ERROR`, deteniendo el resto
de la secuencia.

## 6. Reinicialización

Política adoptada (decisión de esta fase de consolidación):

- **`initialize()` se rechaza con `ALREADY_INITIALIZED`** si el Core ya está
  inicializado y en marcha (`READY`, `RUNNING` o `SHUTTING_DOWN`). No existe
  reinicialización implícita: hay que llamar a `shutdown()` primero.
- **`initialize()` se rechaza con `INITIALIZATION_IN_PROGRESS`** si hay una
  inicialización en curso (`BOOTSTRAPPING`..`LOADING_REGISTRIES`), incluyendo llamadas
  concurrentes mientras una `initialize()` anterior aún está resolviendo.
- **`initialize()` se permite explícitamente desde `UNINITIALIZED`** (arranque
  normal), **`ERROR`** (reintento tras un fallo) y **`STOPPED`** (reinicio tras un
  apagado ordenado).
- En los dos casos de reintento (`ERROR` y `STOPPED`), `ModuleRegistry` y
  `AdapterRegistry` se **recrean por completo** y el agregado de estado
  (`StateManager`) se restablece (`reset()`) antes de volver a ejecutar el flujo de
  arranque. Esto garantiza que no quede ningún módulo, adaptador o estado residual de
  un ciclo de vida anterior: cada reinicialización parte de un estado limpio,
  verificado explícitamente en pruebas (`tests/lifecycle.test.ts`, casos `[7]`, `[7b]`,
  `[8]`, `[9b]`).

## 7. Sistema de eventos

`EventBus` implementa un patrón publicador/suscriptor síncrono con un catálogo
**cerrado** de eventos `core:*` (`EventTypes.ts`). Un fallo en un suscriptor no
interrumpe a los demás: se aísla y se reporta mediante `core:listener-error`.

### Catálogo cerrado `core:*`

| Evento                      | Cuándo se emite                                                          |
| --------------------------- | ------------------------------------------------------------------------ |
| `core:lifecycle-changed`    | En cada transición de estado del ciclo de vida                           |
| `core:config-loaded`        | Al completar la carga de configuración                                   |
| `core:profile-loaded`       | Al completar la carga del perfil activo                                  |
| `core:registries-ready`     | Al quedar listos los registros de módulos y adaptadores                  |
| `core:module-registered`    | Al registrar (commit atómico) un módulo nuevo                            |
| `core:module-unregistered`  | Al eliminar un módulo del registro                                       |
| `core:adapter-registered`   | Al registrar (commit atómico) un adaptador nuevo                         |
| `core:adapter-unregistered` | Al eliminar un adaptador del registro                                    |
| `core:status-reported`      | Cuando un módulo/adaptador reporta su estado (tras el commit)            |
| `core:ready`                | Al completar el arranque con éxito                                       |
| `core:running`              | Al confirmarse que la aplicación está operativa                          |
| `core:shutting-down`        | Al iniciarse el apagado ordenado                                         |
| `core:stopped`              | Al completar el apagado                                                  |
| `core:error`                | Ante cualquier error no recuperable del Core, o fallo durante el apagado |
| `core:listener-error`       | Cuando un suscriptor de un evento lanza una excepción                    |

**Solo el propio Core emite eventos `core:*`.** Este namespace es un catálogo cerrado y
protegido: ni módulos ni adaptadores externos pueden emitir eventos dentro de él (ver
más abajo, `ScopedEventBus`).

### Eventos de dominio de módulos externos

Los módulos externos pueden usar el mismo `EventBus` para sus propios eventos de
dominio, bajo cualquier namespace que **no** empiece por `core:`. A diferencia del
namespace `core:*`, estos eventos son de libre definición: el Core no conoce ni
restringe su forma, solo garantiza que no colisionen con su propio catálogo.

### `ScopedEventBus`: la superficie que reciben módulos y adaptadores

`ModuleContext.eventBus` no es el `EventBus` completo, sino un `ScopedEventBus`
(`EventBus.createScopedEmitter()`):

- **Suscripción (`on` / `once` / `off`)**: sin restricciones. Un módulo puede
  suscribirse tanto a eventos `core:*` (para reaccionar al ciclo de vida del Core)
  como a eventos de dominio de otros módulos.
- **Emisión (`emit`)**: restringida. Intentar emitir un evento `core:*` lanza
  `DWMError` (`RESERVED_EVENT_NAMESPACE`); cualquier otro namespace es de libre uso.

Esto evita que un módulo externo pueda falsificar eventos del ciclo de vida del Core
(por ejemplo, emitir un `core:ready` falso) sin dejar de ofrecerle un canal de
comunicación desacoplado y completamente abierto para sus propios eventos.

## 8. Registro de módulos (atomicidad)

`ModuleRegistry.register(module)` sigue una secuencia estricta de
**"validar → inicializar → confirmar (commit)"**:

1. Se validan identidad (`id` no vacío y sin espacios iniciales/finales, `version` y
   `contractVersion` presentes y con formato semver válido) **antes** de tocar
   ninguna colección interna (`MODULE_INVALID_IDENTITY`, `INVALID_SEMANTIC_VERSION`).
2. Se comprueban unicidad de `id` (`MODULE_ID_DUPLICATED`) y compatibilidad de
   contrato (`MODULE_CONTRACT_INCOMPATIBLE`; misma versión MAYOR ⇒ compatible).
3. Se invoca `module.init(context)`, cuyo `reportStatus` **almacena el estado en
   variables locales** mientras el módulo no esté confirmado — no en las colecciones
   internas del registro.
4. **Si `init()` lanza**, el registro no sufre ninguna modificación: el módulo no
   aparece en `listModules()`, `getModule()` devuelve `undefined` y no queda ningún
   estado residual. El error se propaga como `DWMError` recuperable
   (`MODULE_INIT_FAILED`). No existe "rollback" porque no hay nada que revertir: nada
   se escribió hasta este punto.
5. **Solo si `init()` resuelve correctamente** se realiza el commit: el módulo se
   añade a las colecciones internas y su estado (el último reportado durante `init()`,
   o `OK` por defecto) se hace visible de una sola vez, emitiendo
   `core:module-registered` y `core:status-reported`.

A partir del commit, llamadas posteriores a `context.reportStatus()` (por ejemplo,
durante la operación normal del módulo, no solo en `init()`) actualizan el estado en
vivo y notifican mediante eventos, con normalidad.

## 9. Registro de adaptadores (atomicidad y unicidad de subjectId)

`AdapterRegistry` sigue exactamente la misma disciplina que `ModuleRegistry`
(sección 8), con dos garantías adicionales:

- **Unicidad de `subjectId`**: no se admiten dos adaptadores activos para el mismo
  sujeto (misma herramienta o sistema operativo). La comprobación
  (`ADAPTER_SUBJECT_ID_DUPLICATED`) se realiza antes de invocar `init()`, y el índice
  por `subjectId` solo se actualiza en el commit, igual que el resto de colecciones
  internas: si el registro se rechaza o `init()` falla, el adaptador existente para
  ese `subjectId` no se ve alterado en absoluto.
- **Validación de identidad extendida**: además de `id`, `version` y
  `contractVersion`, se exige `subjectId` no vacío (`ADAPTER_INVALID_IDENTITY`).

## 10. Baja segura (dispose)

**Política adoptada** (aplicada de forma idéntica a `ModuleRegistry.unregister()` y
`AdapterRegistry.unregister()`):

> El componente se retira de **todas** las colecciones internas (incluido el índice
> por `subjectId` en el caso de adaptadores) **antes** de invocar `dispose()`, de
> forma incondicional.

Esto garantiza que el estado interno nunca queda ambiguo: tras `unregister()`, el
componente deja de existir para el registro sin importar si `dispose()` tuvo éxito o
no. Si `dispose()` falla, el fallo no se silencia: se lanza un `DWMError`
(`MODULE_DISPOSE_FAILED` / `ADAPTER_DISPOSE_FAILED`) que envuelve la causa original y
conserva el `id` del componente, para que quien invoque `unregister()` pueda
diagnosticar el fallo o decidir un reintento (por ejemplo, registrando una nueva
instancia del módulo/adaptador). Se descartó la alternativa de "dejar el componente
registrado si `dispose()` falla" precisamente porque produce un estado ambiguo
("¿está registrado o no?") que ninguna otra parte del sistema podría resolver de forma
fiable.

## 11. Apagado ordenado

`shutdown()` aplica la misma política de la sección 10 a **todos** los módulos y
adaptadores registrados, pero nunca se detiene ante un fallo aislado:

- Se intenta dar de baja cada módulo y cada adaptador, aunque alguno falle.
- Cada fallo se **emite individualmente mediante `core:error`** (no se silencia).
- Cada fallo se **agrega** en un `ShutdownReport` (`{ failures: ShutdownFailure[] }`)
  que `shutdown()` devuelve al finalizar, con `kind` (`"module"` | `"adapter"`), `id`
  y el `DWMError` correspondiente.
- El Core **siempre completa la transición a `STOPPED`**, independientemente de
  cuántos fallos se hayan producido.

`shutdown(): Promise<ShutdownReport>` — no `Promise<void>` — precisamente para que
quien invoque el apagado pueda inspeccionar programáticamente qué falló, sin depender
de un futuro Log Manager (fuera del alcance de esta fase).

## 12. Gestión de errores

Toda condición de error dentro del Core se representa mediante `DWMError`, que incluye:

- `code`: código de error perteneciente al catálogo cerrado `ErrorCode`.
- `message`: descripción legible.
- `origin`: subsistema donde se originó (`bootstrap`, `config`, `profile`,
  `lifecycle`, `registry-module`, `registry-adapter`, `event-bus`, `storage`).
- `cause`: error original envuelto, si existe (encadenamiento de causas).
- `recoverable`: booleano que indica si el propio Core puede continuar en
  funcionamiento degradado o si exige transición a `ERROR`.

Reglas:

1. El Core nunca deja escapar una excepción nativa sin envolver hacia el código que lo
   invoca; siempre se traduce a `DWMError` (`DWMError.wrap`).
2. Un error `recoverable: false` durante la inicialización detiene el flujo de la
   sección 5 y transiciona a `ERROR`.
3. Un error `recoverable: true` (por ejemplo, un módulo concreto que falla al
   inicializarse, o un `dispose()` que falla) no detiene el resto del sistema.
4. Todo `DWMError` no recuperable se emite mediante `core:error`, permitiendo que un
   futuro Log Manager (fuera del alcance de esta fase) se suscriba sin que el Core
   dependa de él.

## 13. Gestión del estado e inmutabilidad

`StateManager` mantiene un snapshot interno en memoria con:

- Estado del ciclo de vida (`LifecycleState`).
- Estado de configuración cargada (`OK` / `UNCONFIGURED`).
- Estado del perfil activo (`OK` / `PENDING`).
- Registro de estados reportados por fuente (`recordStatus`).
- `reset()` para reinicialización (sección 6).

**Inmutabilidad externa**: toda estructura que el Core devuelve al exterior —
`getConfig()`, `getActiveProfile()`, `getSnapshot()`, `listModules()`,
`listAdapters()` — es una **copia profunda y congelada** (`deepFreezeClone`, basada en
`structuredClone` + `Object.freeze` recursivo). Modificar el objeto devuelto lanza en
modo estricto y, en cualquier caso, nunca afecta al estado interno real del Core. Cada
llamada devuelve una copia independiente.

## 14. Guardas de ciclo de vida

Toda operación pública valida el estado del ciclo de vida antes de ejecutarse. Tabla
completa de estados permitidos:

| Operación                                                                 | Estados permitidos                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `getLifecycleState`, `getSnapshot`                                        | Cualquiera (diagnóstico siempre disponible, incluido `ERROR`) |
| `getConfig`, `getActiveProfile`                                           | `READY`, `RUNNING`, `SHUTTING_DOWN`, `STOPPED`                |
| `getModule`, `listModules`, `getAdapter`, `getAdapterFor`, `listAdapters` | `READY`, `RUNNING`, `SHUTTING_DOWN`, `STOPPED`                |
| `registerModule`, `registerAdapter`                                       | `READY`, `RUNNING`                                            |
| `unregisterModule`, `unregisterAdapter`                                   | `READY`, `RUNNING`, `SHUTTING_DOWN`                           |
| `reportStatus`                                                            | `READY`, `RUNNING`, `SHUTTING_DOWN`                           |
| `markRunning`                                                             | `READY`                                                       |
| `shutdown`                                                                | `READY`, `RUNNING`                                            |
| `initialize`                                                              | `UNINITIALIZED`, `ERROR`, `STOPPED` (sección 6)               |

Cualquier invocación fuera de su conjunto de estados permitido lanza `DWMError`
(`NOT_READY`), indicando la operación y el estado actual en el mensaje.
`getLifecycleState()` y `getSnapshot()` son las únicas operaciones sin guarda: son la
herramienta de diagnóstico principal y deben funcionar incluso en `ERROR`.

## 15. API pública del Core

Superficie pública expuesta por la clase `DWMCore` (ver `src/core/DWMCore.ts`), con
las firmas **exactas** (asíncronas donde corresponde):

```ts
initialize(options: BootstrapOptions): Promise<void>
markRunning(): void
shutdown(): Promise<ShutdownReport>

getLifecycleState(): LifecycleState
getConfig(): NormalizedConfig                 // copia inmutable
getActiveProfile(): ProfileDescriptor | null  // copia inmutable

registerModule(module: IModule): Promise<void>
unregisterModule(moduleId: string): Promise<void>
getModule(moduleId: string): IModule | undefined
listModules(): ModuleDescriptor[]             // copia inmutable

registerAdapter(adapter: IAdapter): Promise<void>
unregisterAdapter(adapterId: string): Promise<void>
getAdapter(adapterId: string): IAdapter | undefined
getAdapterFor(subjectId: string): IAdapter | undefined
listAdapters(): AdapterDescriptor[]           // copia inmutable

reportStatus(sourceId: string, status: SystemStatus, detail?: string): void
getSnapshot(): SystemSnapshot                 // copia inmutable

on(eventType: CoreEventType, handler: EventHandler): UnsubscribeFn
off(eventType: CoreEventType, handler: EventHandler): void
once(eventType: CoreEventType, handler: EventHandler): void
```

Esta superficie es el **contrato estable** que consumirán el resto de módulos. Cualquier
ampliación futura debe añadir métodos nuevos, nunca modificar la firma de los
existentes sin un proceso de versionado.

## 16. Contratos internos

### `IModule`

```ts
interface IModule {
  id: string;
  version: string; // semver válido
  contractVersion: string; // semver válido; misma MAYOR que el Core ⇒ compatible
  init(context: ModuleContext): Promise<void>;
  dispose?(): Promise<void>;
}
```

### `IAdapter`

```ts
interface IAdapter {
  id: string;
  subjectId: string; // identificador opaco de lo que gestiona (herramienta/SO)
  version: string;
  contractVersion: string;
  init(context: ModuleContext): Promise<void>;
  dispose?(): Promise<void>;
}
```

### `ModuleContext`

```ts
interface ModuleContext {
  eventBus: ScopedEventBus; // ver sección 7
  getConfig(): NormalizedConfig;
  getActiveProfile(): ProfileDescriptor | null;
  reportStatus(status: SystemStatus, detail?: string): void;
}
```

Ningún módulo o adaptador recibe una referencia directa a `DWMCore`, a `ConfigManager`,
a `ModuleRegistry` ni a `AdapterRegistry`; solo reciben `ModuleContext`, una superficie
deliberadamente mínima que impide registrar otros módulos, modificar el ciclo de vida o
acceder a subsistemas internos.

## 17. Límites explícitos del Core (qué NO hace)

- No contiene lógica específica de Windows, macOS ni Linux.
- No contiene lógica específica de ninguna herramienta (Git, VS Code, Kilo Code, Cline,
  Continue, Cursor, Roo, GitLens, Copilot, Ollama, DeepSeek, etc.).
- No implementa el Tooling Manager, AI Manager, Secrets Manager, Profile Manager
  (gestión completa: creación/exportación/importación), Project Manager, Plugin
  Manager, Backup Manager, Restore Manager, Migration Manager, Verification Manager,
  Log Manager ni Status Manager. El Core únicamente ofrece la infraestructura para que
  estos módulos existan y se coordinen.
- No implementa interfaz de usuario alguna.
- No decide ni asume tecnología de interfaz, empaquetado o distribución.
- No persiste secretos ni los conoce; la configuración normalizada que gestiona el
  Core no incluye el subsistema de secretos (Secrets Manager, fuera de esta fase).

## 18. Pruebas y cobertura

La suite (`vitest`) cubre los escenarios exigidos para esta fase: primera ejecución,
carga de configuración y perfil existentes, perfil inexistente como `PENDING`, ciclo
completo de vida, transiciones inválidas, doble inicialización, inicialización
concurrente, inicialización tras `STOPPED`/`ERROR`, fallo no recuperable en bootstrap,
registro/rechazo/rollback de módulos y adaptadores (id duplicado, `subjectId`
duplicado, identidad inválida, contrato incompatible, semver inválido), baja segura
(éxito y fallo de `dispose()`), apagado con múltiples componentes y con fallos
agregados, aislamiento de errores entre listeners, `core:listener-error`, `once()`,
cancelación de suscripción, inmutabilidad de los datos devueltos, y guardas de ciclo de
vida antes de `READY`, durante `ERROR` y después de `STOPPED`.

Umbrales de cobertura exigidos (`vitest.config.ts`, `test.coverage.thresholds`): 90%
líneas, 90% funciones, 85% ramas, 90% sentencias. `npm test` y `npm run test:coverage`
ejecutan siempre con cobertura habilitada, de forma que ambos fallan si los umbrales no
se alcanzan.
