# TDS-001 — Diseño Técnico de la Capa Host y Raíz de Composición

**Proyecto:** Dev Workspace Manager
**Abreviatura:** DWM
**Tipo de documento:** Technical Design Specification (TDS) — diseño técnico implementable
**Estado:** Aceptado — Referencia técnica obligatoria para la futura implementación de `packages/host`
**Versión:** 1.0.1
**Fecha:** 2026-07-28
**Documentos de referencia:**
- ADR-001 — Arquitectura Oficial del Proyecto
- ADR-002 v1.0.1 — Contratos Internos del Sistema (en particular, sección 17: Capa Host y raíz de composición)
- FRS-001 — Especificación Funcional Oficial
- DWM Core (`packages/core`, congelado) — superficie pública consumida por este diseño

---

## Alcance

Este documento convierte la sección 17 de ADR-002 en un diseño técnico implementable.
No introduce ninguna decisión de arquitectura nueva respecto de ADR-001, ADR-002 o
FRS-001; los desarrolla hasta el nivel de detalle necesario para que una futura
implementación de `packages/host` pueda comenzar sin tener que resolver decisiones de
diseño sobre la marcha. No contiene código, pseudocódigo, ni firmas de TypeScript: toda
descripción de comportamiento, entradas y salidas es conceptual.

Esta versión (1.0.1) corrige contradicciones detectadas en la versión 1.0.0: unifica
en un único orden oficial el flujo de inicialización y la máquina de estados del host;
cierra la política de reinicialización (una instancia de `ApplicationHost` es de un
solo uso); establece una única regla de acceso al `DependencyContainer` (exclusiva de
`CompositionRoot`); formaliza `ComponentBundle` como el mecanismo que separa el ciclo
de vida registrable en el Core de la superficie pública de dominio de cada componente;
corrige el ejemplo de coordinación entre un módulo y un adaptador para que ninguno de
los dos reciba una referencia del otro; y añade una política transaccional de
rollback, limpieza y cancelación cooperativa. Ninguna de estas correcciones exige
modificar el Core, ADR-001, ADR-002 ni FRS-001.

El Core (`packages/core`) permanece congelado. Todo lo descrito aquí se apoya
exclusivamente en su superficie pública ya existente:

- `DWMCore`: `initialize`, `markRunning`, `shutdown` (que devuelve un informe agregado
  de fallos), `getLifecycleState`, `getConfig`, `getActiveProfile`, `registerModule`,
  `unregisterModule`, `getModule`, `listModules`, `registerAdapter`,
  `unregisterAdapter`, `getAdapter`, `getAdapterFor`, `listAdapters`, `reportStatus`,
  `getSnapshot`, `on`/`off`/`once`.
- `IModule` / `IAdapter`: identidad, versión, versión de contrato, `init(context)`,
  `dispose()` opcional. Describen exclusivamente ciclo de vida, no operaciones de
  negocio (sección 11).
- `ModuleContext`: exactamente cuatro elementos — bus de eventos de alcance
  restringido, consulta de configuración, consulta de perfil activo, reporte de
  estado propio. Nada más.
- `DWMError` y su catálogo de códigos, el vocabulario cerrado de estados, y el
  `StorageProvider` que el propio Core usa internamente para su configuración.

Ninguna pieza descrita en este documento requiere ampliar esa superficie.

---

## Índice

1. Responsabilidades
2. Arquitectura interna
3. Reglas de dependencias
4. Orden único de inicialización, construcción y registro
5. Modelo de dependencias externas
6. Coordinación de casos de uso
7. Ciclo de vida y política de uso único
8. Rollback, limpieza y cancelación cooperativa
9. Errores y resultados
10. Configuración del host
11. Capacidades declarativas y `ComponentBundle`
12. Componentes mandatorios y opcionales
13. Consulta de estado
14. Estructura del paquete
15. API pública propuesta
16. Estrategia de pruebas
17. Criterios de aceptación
18. Glosario
19. Control de versiones del documento

---

## 1. Responsabilidades

### 1.1 Responsabilidades que sí tiene la capa host

1. **Crear la instancia de `DWMCore`.** Es el único componente del sistema que lo
   hace; ningún módulo, adaptador ni futura interfaz instancia el Core.
2. **Proporcionar las dependencias necesarias para inicializar el Core** — en
   concreto, construir y entregar el `StorageProvider` que `DWMCore.initialize()`
   exige en sus `BootstrapOptions`.
3. **Validar la composición completa antes de construir nada costoso**: manifiestos,
   identidades, versiones, capacidades y grafo de dependencias (sección 4).
4. **Construir módulos y adaptadores mediante fábricas**, siguiendo el orden ya
   validado, separando siempre su ciclo de vida registrable de su superficie pública
   de dominio (`ComponentBundle`, sección 11).
5. **Proporcionar a cada componente sus dependencias externas antes del registro**
   (sección 5), nunca después y nunca a través del Core.
6. **Registrar módulos y adaptadores mediante la API pública del Core**
   (`registerModule`, `registerAdapter`), y darlos de baja cuando corresponda
   (`unregisterModule`, `unregisterAdapter`).
7. **Controlar el orden de composición** a partir del grafo de dependencias resuelto
   en la validación previa, sin que ello implique que un módulo dependa directamente
   de otro.
8. **Ejecutar `initialize()`, `markRunning()` y `shutdown()`** del Core, en los
   momentos exactos que exige la secuencia única de la sección 4 y la máquina de
   estados de la sección 7.
9. **Consultar el snapshot y los registros públicos del Core** (`getSnapshot`,
   `listModules`, `listAdapters`, `getModule`, `getAdapter`, `getAdapterFor`) — el
   único componente del sistema con esa visibilidad (ADR-002 §17.5), siempre
   respetando qué operaciones son válidas en cada estado del Core (sección 13).
10. **Coordinar casos de uso que requieren varios componentes** (sección 6), a través
    de un `UseCaseCoordinator`, entregando a cada uno solo las superficies de dominio
    concretas que necesita.
11. **Recopilar y exponer el resultado de operaciones agregadas** (composición,
    registro, rollback, apagado) como estructuras de datos explícitas y consultables
    (sección 9, `HostStatusReport`).
12. **Gestionar el cierre ordenado de la aplicación**, incluyendo la liberación de
    dependencias externas propias del host, y **gestionar el rollback determinista**
    ante un fallo mandatorio o una cancelación durante la inicialización (sección 8).

### 1.2 Responsabilidades que la capa host NO tiene

1. **No contiene lógica específica de herramientas.** Ninguna rama de código de la
   capa host se condiciona por "Git", "VS Code", "Kilo Code" ni ninguna herramienta
   concreta; esa lógica, si existe, vive exclusivamente en un adaptador.
2. **No contiene lógica específica de Windows, macOS o Linux.** Ninguna rama de
   código de la capa host se condiciona por sistema operativo; esa lógica, si existe,
   vive exclusivamente en un adaptador de sistema operativo.
3. **No almacena secretos**, ni en `HostConfiguration`, ni en el estado interno de
   `ApplicationHost`, ni en ningún `HostStatusReport`, ni en ningún error (sección 9).
4. **No sustituye a los módulos funcionales.** La capa host no reimplementa lógica de
   negocio; solo construye, registra y coordina la colaboración entre componentes.
5. **No modifica el Core.**
6. **No permite importaciones directas entre módulos, ni entre un módulo y un
   adaptador.** Ningún componente conoce a otro; solo la capa host conoce a más de
   uno a la vez (sección 6).
7. **No se convierte en una interfaz gráfica.**
8. **No reintenta implícitamente una inicialización fallida sobre la misma
   instancia.** Una instancia de `ApplicationHost` es de un solo uso (sección 7).

---

## 2. Arquitectura interna

La capa host se organiza en las siguientes piezas. Ninguna de ellas requiere un
contenedor de inyección de dependencias de terceros: toda la composición se expresa
como construcción explícita en TypeScript puro.

### 2.1 `ApplicationHost`

Fachada pública de todo el paquete. Es el único punto de entrada que un proceso
externo utiliza. Internamente:

- Posee la máquina de estados propia del host (sección 7) y aplica su política de
  uso único.
- Delega toda la validación y construcción en `CompositionRoot`.
- Delega el arranque y parada en `LifecycleCoordinator` y `ShutdownCoordinator`.
- Expone la API pública descrita en la sección 15.
- Mantiene el último `HostStatusReport` disponible para consulta (sección 13).

### 2.2 `CompositionRoot`

Pieza responsable de la validación y la composición explícita del sistema: carga y
valida manifiestos, construye el grafo de dependencias, detecta ausencias,
incompatibilidades y ciclos, determina el orden topológico, y —solo si toda esa
validación es correcta— construye cada módulo y adaptador (obteniendo de cada fábrica
un `ComponentBundle`, sección 11) y registra su instancia de ciclo de vida en el Core.

`CompositionRoot` es la **única** pieza con acceso al `DependencyContainer` (sección
2.4) y la única con visibilidad simultánea sobre las fábricas, las dependencias
externas y la instancia de `DWMCore`.

### 2.3 `ModuleFactory` / `AdapterFactory`

Abstracción de fábrica: una unidad que, recibiendo de `CompositionRoot` un **conjunto
explícito y ya resuelto de dependencias** (no una referencia al contenedor), produce
un `ComponentBundle` (sección 11) para su componente.

Una fábrica:

- **No conoce `DependencyContainer`.** Recibe únicamente los valores concretos que
  necesita, ya resueltos por `CompositionRoot`; no realiza ninguna búsqueda dinámica
  ni consulta ningún registro por su cuenta.
- **No conoce `DWMCore`.** No registra su propio componente; el registro es
  responsabilidad exclusiva de `CompositionRoot`.
- **No conoce otras fábricas ni sus componentes.**
- **Solo construye y devuelve su `ComponentBundle`.** Ninguna otra acción.

### 2.4 `DependencyContainer`

Mecanismo explícito y auditable (no un framework de terceros) que almacena las
dependencias externas (sección 5) ya construidas, indexadas por el contrato que
representan. **Regla de acceso única y sin excepciones: solo `CompositionRoot` lee o
escribe en `DependencyContainer`.** Ninguna fábrica, ningún módulo, ningún adaptador y
ningún coordinador tienen acceso a él. `CompositionRoot` resuelve, para cada
componente, exactamente las dependencias que su manifiesto declara necesitar, y se
las entrega a la fábrica correspondiente como un conjunto explícito de valores; la
fábrica nunca "pide" nada al contenedor por sí misma.

### 2.5 `UseCaseCoordinator`

Pieza (o familia de piezas) que coordina operaciones que requieren la colaboración de
más de un componente ya construido y registrado (sección 6). Recibe, en su propia
construcción, las **superficies públicas de dominio** concretas que necesita
(sección 11), entregadas por `CompositionRoot`; nunca las busca por su cuenta, nunca
recibe una superficie que no necesite, y nunca recibe la instancia de ciclo de vida
registrada en el Core (esa la posee y gestiona exclusivamente `CompositionRoot`).

### 2.6 `LifecycleCoordinator`

Pieza responsable de ejecutar, en el orden único de la sección 4, los pasos que
involucran directamente al ciclo de vida del Core (`initialize`, `markRunning`) y de
notificar a `ApplicationHost` las transiciones de estado propias del host
correspondientes.

### 2.7 `ShutdownCoordinator`

Pieza responsable de secuenciar el apagado normal (invocando `DWMCore.shutdown()`,
liberando dependencias externas propias del host, y agregando el resultado en un
`HostStatusReport`) y de ejecutar la misma política de rollback (sección 8) cuando el
apagado se produce como consecuencia de una cancelación durante la inicialización o
de un fallo mandatorio.

### 2.8 `HostConfiguration`

Estructura de datos pasiva (sección 10) que describe cómo debe componerse y
ejecutarse la aplicación.

### 2.9 `HostErrorCatalog`

Catálogo cerrado de códigos de error propios del host, con prefijo `HOST_` (sección
9).

### 2.10 `HostStatusReport`

Estructura de datos de solo lectura que agrega el resultado de composición, registro,
rollback y apagado (sección 9, sección 13).

### 2.11 `ComponentBundle` (formalizado en esta versión)

Resultado que produce toda fábrica: un contenedor que separa, para un mismo
componente, tres elementos distintos (sección 11): su instancia de ciclo de vida
(conforme a `IModule`/`IAdapter`), su superficie pública de dominio, y su manifiesto
ya validado. Es la unidad que `CompositionRoot` recibe de cada fábrica y a partir de
la cual decide qué se registra en el Core y qué se entrega, selectivamente, a los
coordinadores.

### 2.12 Diagrama de dependencias permitidas entre piezas

```
ApplicationHost
   → LifecycleCoordinator
   → ShutdownCoordinator
   → CompositionRoot
   → HostConfiguration (lectura)
   → HostStatusReport (lectura/exposición)

CompositionRoot
   → ModuleFactory / AdapterFactory (una por componente a construir)
   → DependencyContainer (acceso exclusivo; ninguna otra pieza lo tiene)
   → HostErrorCatalog
   → API pública de DWMCore (registrar, dar de baja, resolver adaptadores)
   → ComponentBundle de cada componente (posee las superficies de dominio)

LifecycleCoordinator / ShutdownCoordinator
   → API pública de DWMCore (initialize / markRunning / shutdown)
   → HostErrorCatalog

UseCaseCoordinator
   → únicamente las superficies públicas de dominio que recibe de CompositionRoot
   → HostErrorCatalog

ModuleFactory / AdapterFactory
   → únicamente el conjunto explícito de dependencias que CompositionRoot le entrega
   → (sin acceso a DependencyContainer, sin acceso a DWMCore, sin acceso a otras
      fábricas)
```

Ninguna flecha apunta en sentido inverso: ni una fábrica, ni un `UseCaseCoordinator`,
ni ningún módulo o adaptador construido, tienen visibilidad sobre `CompositionRoot`,
sobre `ApplicationHost`, sobre `DependencyContainer` ni sobre `DWMCore` más allá de lo
que el propio Core ya concede a través de `ModuleContext`.

---

## 3. Reglas de dependencias

Dirección de dependencias estricta, sin excepción:

```
ApplicationHost / CompositionRoot / Coordinators   (capa host)
        │
        ▼  (usa exclusivamente la API pública)
      DWMCore                                       (Core, congelado)
        │
        ▼  (entrega ModuleContext, nada más)
  Módulos / Adaptadores (instancias de ciclo de vida)
```

Queda prohibido, sin excepción:

1. **Que un módulo importe otro módulo funcional.**
2. **Que un adaptador importe otro adaptador.**
3. **Que un módulo importe o reciba una referencia a un adaptador, ni viceversa.**
   Ambos son, el uno para el otro, componentes opacos; solo un coordinador puede
   sostener referencias a las superficies de dominio de ambos a la vez (sección 6).
4. **Que un módulo acceda directamente a `DWMCore`.**
5. **Que un módulo consulte los registros del Core** (`listModules`, `listAdapters`,
   `getModule`, `getAdapter`, `getAdapterFor`): ninguna de esas operaciones está
   disponible desde `ModuleContext`.
6. **Que un módulo reciba `getSnapshot()`.**
7. **Que una fábrica acceda a `DependencyContainer`.** Solo `CompositionRoot` tiene
   ese acceso (sección 2.4).
8. **Que una fábrica conozca `DWMCore` o realice el registro de su propio
   componente.**
9. **Que la capa host contenga lógica propia de una herramienta o sistema
   operativo.**
10. **Que exista una dependencia circular** entre las declaraciones de dependencias
    externas o de capacidades requeridas de los componentes a construir. Se detecta
    antes de construir nada (sección 4) y se trata como un fallo no recuperable del
    conjunto de componentes implicados en el ciclo, no de un componente aislado.

La capa host **sí** puede conocer los contratos públicos (manifiestos, fábricas,
`ComponentBundle`) de los módulos y adaptadores que ella misma construye y coordina.
Lo que nunca ocurre es que **los componentes se conozcan entre ellos**: el
conocimiento fluye siempre desde la capa host hacia los componentes, nunca entre
componentes, y nunca desde una fábrica hacia el contenedor de dependencias o hacia el
Core.

---

## 4. Orden único de inicialización, construcción y registro

Esta sección fija el **único orden oficial**, sin variantes en ninguna otra sección de
este documento. Toda referencia a construcción, validación o registro en cualquier
otra sección presupone exactamente esta secuencia.

1. **Crear y validar `HostConfiguration`.** Un error de forma aquí es no recuperable
   (`HOST_INVALID_CONFIGURATION`); no se ejecuta ningún paso posterior.
2. **Cargar y validar manifiestos.** Cada manifiesto declarado en `HostConfiguration`
   se carga y se valida en su forma (`HOST_INVALID_MANIFEST` si un manifiesto
   individual es inválido).
3. **Validar identidades, versiones, capacidades y dependencias declaradas.** Formato
   de identidad, formato semver de versión y versión de contrato (ADR-002 §12),
   forma de las capacidades provistas/requeridas y de las dependencias externas
   declaradas por cada manifiesto.
4. **Construir el grafo de dependencias.** A partir de las capacidades requeridas y
   provistas por cada manifiesto (quién necesita a quién).
5. **Detectar dependencias ausentes, capacidades incompatibles y ciclos.** Sobre el
   grafo ya construido, sin haber creado todavía ningún recurso costoso.
6. **Determinar el orden topológico de composición.** El orden en que se construirán
   y registrarán los componentes, de forma que ninguno se construya antes que
   aquello de lo que depende.
7. **Crear el `StorageProvider` requerido por `DWMCore`.**
8. **Crear `DWMCore`.**
9. **Inicializar `DWMCore`** (`initialize()`). Si esta llamada se rechaza, no se
   ejecuta ningún paso posterior (sección 8, "el Core entra en `ERROR`").
10. **Construir las dependencias externas del host** (sección 5), según el orden
    topológico ya validado.
11. **Construir módulos y adaptadores**, siguiendo el orden ya validado, obteniendo
    de cada fábrica su `ComponentBundle` (sección 11).
12. **Registrar módulos y adaptadores**: `CompositionRoot` invoca `registerModule` /
    `registerAdapter` con la instancia de ciclo de vida de cada `ComponentBundle`, en
    el mismo orden topológico.
13. **Construir los coordinadores de casos de uso**, entregando a cada uno las
    superficies públicas de dominio concretas (de los `ComponentBundle` ya
    construidos) que necesita.
14. **Dejar el host en `READY`.**
15. **Invocar la operación pública de arranque del host**, que internamente invoca
    `markRunning()` sobre el Core y transiciona el host a `RUNNING`. Este paso es una
    operación pública distinta e independiente de los 14 anteriores (sección 15);
    ocurre solo cuando quien use la capa host decide iniciar la ejecución.

**La validación (pasos 1-6) ocurre siempre antes de construir cualquier módulo,
adaptador o dependencia externa costosa (pasos 7-13)**: ningún recurso con coste (una
conexión, un fichero, una instancia de módulo) se crea mientras quede pendiente
cualquier comprobación de manifiestos, capacidades o ciclos.

### 4.1 Qué ocurre ante cada condición de fallo

- **Falla la construcción de un módulo (paso 11).** Se envuelve como
  `HOST_MODULE_CONSTRUCTION_FAILED`. Política de mandatorio/opcional (sección 12).
- **Falla el registro de un módulo (paso 12).** El `DWMError` que devuelve
  `registerModule` se envuelve adicionalmente como `HOST_MODULE_REGISTRATION_FAILED`,
  preservando la causa. Misma política.
- **Falla la construcción de un adaptador.** Análogo, `HOST_ADAPTER_CONSTRUCTION_FAILED`.
- **Falla el registro de un adaptador.** Análogo, `HOST_ADAPTER_REGISTRATION_FAILED`.
- **Falta una dependencia requerida.** Se detecta en el paso 5, antes de construir
  nada: `HOST_DEPENDENCY_MISSING`. El componente afectado nunca llega a construirse.
- **Existe una dependencia circular.** Se detecta en el paso 5:
  `HOST_CIRCULAR_DEPENDENCY`, no recuperable para el conjunto de componentes del
  ciclo; si alguno es mandatorio, aborta toda la composición.
- **Una capacidad requerida no está disponible o es incompatible.** Se detecta en el
  paso 5: `HOST_CAPABILITY_UNAVAILABLE`. Se trata igual que una dependencia ausente.
- **El Core entra en `ERROR` (paso 9).** No se ejecuta ningún paso 10 en adelante.
  Se envuelve como `HOST_CORE_INITIALIZATION_FAILED` y el host transiciona a su
  propio `ERROR` (sección 7), tras el rollback correspondiente (sección 8, que en
  este caso solo libera lo que ya existiera antes del paso 9, es decir, nada, salvo
  el propio `StorageProvider` si su liberación es aplicable).
- **`shutdown()` (paso final, apagado normal) devuelve fallos parciales.** Se
  incorporan tal cual al `HostStatusReport` (sección 9).

Cualquier fallo mandatorio en los pasos 10-13 dispara la política de rollback
completa (sección 8), incluyendo, si el Core ya fue inicializado (paso 9 completado),
solicitar `shutdown()` del Core para liberar lo ya registrado.

---

## 5. Modelo de dependencias externas

Un módulo puede necesitar infraestructura que `ModuleContext` no contiene (ADR-002
§9). Esa necesidad se resuelve exclusivamente así:

1. **Se entrega durante la construcción** (paso 11 de la sección 4), como parte del
   conjunto explícito de dependencias que `CompositionRoot` entrega a la fábrica
   (nunca a través de `DependencyContainer` directamente, sección 2.4).
2. **Nunca se busca dentro del Core.**
3. **Nunca se añade a `ModuleContext`.**
4. **Se expresa mediante contratos mínimos**, definidos por convención del
   ecosistema de módulos (no por el Core).
5. **Puede sustituirse por dobles de prueba.**
6. **No obliga a un backend concreto.**
7. **Cada dependencia externa construida se registra en la pila de limpieza**
   (sección 8) en el momento de su creación (paso 10 de la sección 4), para que un
   fallo posterior pueda liberarla de forma determinista.

### 5.1 Casos conceptuales de dependencia externa

- **Almacenamiento propio de un módulo.** Forma conceptual equivalente a la que usa
  internamente el Core (lectura, escritura, existencia, eliminación de un valor
  asociado a una clave), pero como **contrato propio del ecosistema de módulos**, no
  como reexportación del tipo interno del Core.
- **Reloj.** Dependencia mínima para obtener el instante actual, sustituible por un
  reloj fijo en pruebas.
- **Generador de identificadores.** Dependencia mínima para producir identificadores
  únicos, sustituible por un generador determinista en pruebas.
- **Cifrado.** Dependencia mínima para cifrar y descifrar valores.
- **Acceso de red.** Dependencia mínima para solicitudes salientes, sustituible por
  una implementación simulada en pruebas.
- **Sistema de archivos abstracto.** Dependencia mínima para trabajar con rutas y
  ficheros reales, sin asumir convenciones de un sistema operativo concreto (esa
  responsabilidad sigue perteneciendo al adaptador correspondiente, ADR-001 §8.4).

Ninguno de estos servicios se implementa en este documento.

---

## 6. Coordinación de casos de uso

`UseCaseCoordinator` coordina operaciones que requieren la colaboración de más de un
componente ya construido y registrado. Reglas fijas:

1. **Los componentes no se invocan entre sí.** Toda invocación que cruce de un
   componente a otro dentro de un caso de uso la realiza el coordinador.
2. **Los eventos no se usan como RPC** (ADR-002 §5).
3. **Los secretos no viajan por el `EventBus`.**
4. **El coordinador entrega únicamente los datos mínimos necesarios** para la
   operación concreta en curso.
5. **El coordinador no conserva secretos después de la operación.**
6. **Toda operación agregada devuelve un resultado explícito.**
7. **El coordinador recibe únicamente superficies públicas de dominio** (sección 11),
   nunca instancias de ciclo de vida registradas en el Core, y nunca una superficie
   que no necesite para el caso de uso concreto que resuelve.
8. **Ningún componente recibe la superficie pública de otro componente.** Un módulo
   no recibe la superficie de un adaptador, un adaptador no recibe la superficie de
   un módulo, y un módulo no recibe la superficie de otro módulo. Solo el
   coordinador sostiene, temporalmente y para un caso de uso concreto, referencias a
   más de una superficie a la vez.

### 6.1 Ejemplos conceptuales obligatorios

- **Obtener una credencial y probar un proveedor de IA.** El coordinador recibe, en
  su propia construcción, la superficie pública de dominio de un componente de
  gestión de secretos y la de un componente de gestión de proveedores de IA (ambas
  entregadas por `CompositionRoot` a partir de los `ComponentBundle` ya construidos).
  El coordinador solicita a la primera superficie el valor de la credencial
  necesaria, y lo entrega directamente, como parámetro, a la operación de prueba de
  conexión de la segunda superficie. El resultado se devuelve como resultado
  explícito del caso de uso; la credencial no se retiene en el coordinador tras la
  llamada, y en ningún momento el componente de IA recibe una referencia al
  componente de secretos, ni viceversa.

- **Localizar un adaptador y verificar una herramienta.** `CompositionRoot`, durante
  la composición (paso 6 de la sección 4), ya determinó, a partir del grafo de
  dependencias, qué adaptador corresponde a qué sujeto (herramienta) para el
  componente de gestión de herramientas, y entregó al coordinador correspondiente la
  superficie pública de dominio de ambos —el componente de gestión de herramientas y
  el adaptador— por separado. El coordinador invoca **primero** la superficie del
  adaptador para obtener el resultado específico de detección o verificación (por
  ejemplo, versión instalada, o ausencia de la herramienta). El coordinador entrega
  **después** a la superficie del componente de gestión de herramientas únicamente el
  resultado normalizado necesario para que este actualice su propio modelo o
  produzca el resultado del caso de uso. En ningún momento el componente de gestión
  de herramientas recibe una referencia al adaptador, ni el adaptador recibe una
  referencia al componente de gestión de herramientas; ninguno de los dos importa al
  otro; el coordinador es el único que sostiene ambas referencias, y solo durante la
  ejecución de este caso de uso concreto.

- **Crear un backup usando datos de varios módulos.** El coordinador, con las
  superficies de dominio de cada componente propietario de datos relevantes,
  solicita a cada una su propia representación exportable, ensambla un único
  paquete, y lo entrega a la dependencia externa de almacenamiento correspondiente
  (sección 5). El resultado agregado indica qué partes se obtuvieron correctamente y
  cuáles no.

- **Construir el estado que consumirá una futura interfaz.** El coordinador combina
  el snapshot agregado del Core (obtenido por la capa host mediante `getSnapshot()`,
  nunca por un módulo) con la información pública que cada superficie de dominio
  relevante decide exponer, y ensambla una única vista de solo lectura. Ningún
  componente consulta a otro para construir esa vista: el coordinador es quien
  agrega.

---

## 7. Ciclo de vida y política de uso único

### 7.1 Estados propios del host

```
CREATED
   → VALIDATING_COMPOSITION
   → INITIALIZING_CORE
   → BUILDING_COMPONENTS
   → REGISTERING_COMPONENTS
   → READY
   → RUNNING
   → SHUTTING_DOWN
   → STOPPED

(desde cualquier estado anterior a STOPPED, ante un fallo no recuperable) → ERROR
```

Esta secuencia sustituye íntegramente a la usada en la versión 1.0.0 de este
documento (que incluía un único estado `COMPOSING` genérico); los estados
`VALIDATING_COMPOSITION`, `BUILDING_COMPONENTS` y `REGISTERING_COMPONENTS` reemplazan
a `COMPOSING` con la granularidad exacta del orden de la sección 4.

### 7.2 Qué acción provoca cada transición

| Transición | Acción que la provoca |
|---|---|
| `CREATED` → `VALIDATING_COMPOSITION` | Se invoca la operación de inicialización del host (sección 15) con una `HostConfiguration`. |
| `VALIDATING_COMPOSITION` → `INITIALIZING_CORE` | Pasos 1-6 de la sección 4 concluyen sin fallo. |
| `INITIALIZING_CORE` → `BUILDING_COMPONENTS` | Pasos 7-9 concluyen con éxito (`DWMCore` en `READY`). |
| `BUILDING_COMPONENTS` → `REGISTERING_COMPONENTS` | Pasos 10-11 concluyen (construcción de dependencias externas, módulos y adaptadores; los componentes opcionales fallidos quedan omitidos, sección 12). |
| `REGISTERING_COMPONENTS` → `READY` | Paso 12 concluye para todos los componentes mandatorios, y el paso 13 (construcción de coordinadores) concluye. |
| `READY` → `RUNNING` | Se invoca la operación pública de arranque (paso 15 de la sección 4); internamente invoca `markRunning()`. |
| `RUNNING` → `SHUTTING_DOWN` | Se invoca la operación de apagado del host. |
| `READY` → `SHUTTING_DOWN` | Se invoca la operación de apagado del host sin haber llegado a `RUNNING`. |
| `SHUTTING_DOWN` → `STOPPED` | `DWMCore.shutdown()` concluye (si el Core llegó a inicializarse) y la liberación de dependencias externas del host concluye, sin que la propia limpieza deje una condición no recuperable. |
| Cualquiera de `VALIDATING_COMPOSITION`, `INITIALIZING_CORE`, `BUILDING_COMPONENTS`, `REGISTERING_COMPONENTS`, `READY`, `RUNNING`, `SHUTTING_DOWN` → `ERROR` | Fallo mandatorio no recuperable (sección 4.1), o la propia limpieza/rollback (sección 8) deja el host en condición no recuperable. |

### 7.3 Recursos que pueden existir en cada estado

| Estado | Recursos existentes |
|---|---|
| `CREATED` | Ninguno más que la propia instancia del host y la `HostConfiguration` recibida. |
| `VALIDATING_COMPOSITION` | Manifiestos cargados y el grafo de dependencias en memoria. Ningún recurso costoso (ni `StorageProvider`, ni `DWMCore`, ni componente alguno). |
| `INITIALIZING_CORE` | El `StorageProvider` y la instancia de `DWMCore` (en proceso de inicializarse o ya inicializada). Ningún módulo ni adaptador todavía. |
| `BUILDING_COMPONENTS` | `DWMCore` en `READY`. Dependencias externas del host ya construidas (según avanza el paso 10). `ComponentBundle` de cada componente construido (según avanza el paso 11), todavía no registrados. |
| `REGISTERING_COMPONENTS` | Todo lo anterior, más las instancias de ciclo de vida ya registradas en el Core (según avanza el paso 12) y los coordinadores ya construidos (paso 13). |
| `READY` | Composición completa: Core en `READY`, todos los componentes mandatorios registrados, coordinadores construidos. |
| `RUNNING` | Lo anterior, con `DWMCore` en `RUNNING`. |
| `SHUTTING_DOWN` | Recursos en proceso de liberación (orden inverso, sección 8). |
| `STOPPED` | Ningún recurso vivo; solo el último `HostStatusReport` conservado para consulta. |
| `ERROR` | Solo lo que la limpieza/rollback no haya podido liberar, junto con el error principal y los errores de rollback, conservados en el `HostStatusReport` para diagnóstico. |

### 7.4 Operaciones públicas permitidas en cada estado

| Estado | Operaciones permitidas (sección 15) |
|---|---|
| `CREATED` | Inicializar. Consultar estado. |
| `VALIDATING_COMPOSITION`, `INITIALIZING_CORE`, `BUILDING_COMPONENTS`, `REGISTERING_COMPONENTS` | Consultar estado. Solicitar apagado (interpretado como cancelación cooperativa, sección 8). |
| `READY` | Arrancar (`start`). Solicitar apagado. Consultar estado. |
| `RUNNING` | Ejecutar casos de uso. Solicitar apagado. Consultar estado. |
| `SHUTTING_DOWN` | Consultar estado. |
| `STOPPED` | Consultar estado. Consultar el último informe de apagado. |
| `ERROR` | Consultar estado. Consultar el último informe disponible. |

Ejecutar casos de uso **solo** está permitido en `RUNNING` (nunca en `READY`, para
evitar que un caso de uso se ejecute contra componentes que aún no se consideran en
servicio).

### 7.5 Transiciones rechazadas explícitamente

- Cualquier transición no listada en la tabla de la sección 7.2.
- Invocar la inicialización del host desde cualquier estado distinto de `CREATED`
  (sección 7.6).
- Invocar el arranque (`start`) desde cualquier estado distinto de `READY`.
- Ejecutar casos de uso desde cualquier estado distinto de `RUNNING`.

### 7.6 Política de uso único (cierre definitivo, sin políticas futuras abiertas)

**Una instancia de `ApplicationHost` es de un solo uso.** Regla definitiva, cerrada en
esta versión 1.0.1, sin excepciones ni extensiones futuras implícitas:

- La operación de inicialización del host **solo** puede ejecutarse desde `CREATED`.
  Invocarla desde cualquier otro estado se rechaza con `HOST_INVALID_STATE_TRANSITION`.
- La operación de arranque (`start`) **solo** puede ejecutarse desde `READY`.
- La operación de apagado puede ejecutarse desde `READY` o `RUNNING` (apagado normal)
  o desde cualquier estado de composición en curso (cancelación, sección 8).
- **Después de `STOPPED`, la instancia no puede reinicializarse.**
- **Después de `ERROR`, la instancia no puede reinicializarse.**
- **Para reintentar, debe crearse una nueva instancia de `ApplicationHost`**, con su
  propia `HostConfiguration` (idéntica o distinta) y su propio ciclo de vida
  completo desde `CREATED`.

**Justificación:** permitir reinicializar la misma instancia obligaría a definir qué
subconjunto de su estado interno (grafo de dependencias ya resuelto, dependencias
externas ya construidas, referencias a componentes ya liberados) se conserva y cuál
se descarta, introduciendo una superficie de estado residual imposible de auditar de
forma determinista. Exigir una instancia nueva por cada intento garantiza que **todo**
el estado de una ejecución fallida se descarta con la propia instancia, sin
excepciones parciales: el determinismo (ADR-001, principio P8) se preserva mejor
mediante instancias desechables que mediante una máquina de estados reentrante. Esta
es la misma razón por la que el propio Core, al reinicializarse tras `ERROR` o
`STOPPED`, recrea sus registros internos por completo en lugar de reutilizarlos
parcialmente (Core, README §6); aquí se aplica el mismo principio de forma aún más
estricta, a nivel de instancia completa, precisamente porque la capa host coordina
recursos externos (sección 5) que el propio Core no conoce y que, por tanto, ninguna
lógica de "reinicialización parcial" podría auditar seguramente.

### 7.7 Relación entre el estado del host y `LifecycleState` del Core

El host **no duplica ni sustituye** la máquina de estados del Core: `LifecycleState`
sigue siendo la única fuente de verdad sobre el estado del Core en sí mismo.

- `INITIALIZING_CORE` (host) es el intervalo durante el cual el host invoca y espera
  la resolución de `DWMCore.initialize()`; el host no observa los sub-estados
  internos del Core (`BOOTSTRAPPING`, `LOADING_CONFIG`, etc.), solo el resultado
  final.
- `BUILDING_COMPONENTS` y `REGISTERING_COMPONENTS` (host) **no tienen equivalente en
  `LifecycleState`**: para el Core, construir y registrar componentes son
  simplemente operaciones públicas válidas mientras su estado es `READY`; es la capa
  host quien distingue, por razones propias de composición, la fase de construcción
  de la fase de registro.
- `RUNNING` (host) implica que ya se invocó `markRunning()` y que `LifecycleState`
  del Core es también `RUNNING`.
- `SHUTTING_DOWN`/`STOPPED` (host) engloban el intervalo en el que `LifecycleState`
  del Core pasa por sus propios `SHUTTING_DOWN`/`STOPPED`, pero el host puede seguir
  liberando sus propias dependencias externas después de que el Core ya haya
  alcanzado `STOPPED`.
- `ERROR` (host) es un estado **propio**, no una copia del `ERROR` del Core: el host
  puede alcanzarlo por causas que nunca llegan a tocar al Core (por ejemplo, un
  ciclo de dependencias detectado en `VALIDATING_COMPOSITION`, antes de que exista
  ninguna instancia de `DWMCore`).

---

## 8. Rollback, limpieza y cancelación cooperativa

### 8.1 Pila de limpieza

Durante los pasos 7, 8, 10, 11 y 12 de la sección 4, cada vez que se crea un recurso
con coste —el `StorageProvider`, `DWMCore` en sí (a efectos de saber que ya existe y
puede requerir `shutdown()`), cada dependencia externa del host, y cada
`ComponentBundle` construido o registrado—, se añade una entrada a una **pila de
limpieza** en memoria, en el mismo orden en que se creó. Cada componente registrado
con éxito se añade también, en ese mismo momento, al `HostStatusReport` de
composición en curso (sección 9).

### 8.2 Política ante el fallo de un componente mandatorio

Si falla la construcción o el registro de un componente mandatorio (o si una
dependencia ausente, una capacidad incompatible o un ciclo afectan a un componente
mandatorio, sección 12):

1. **No se construyen más componentes.** La composición se detiene en el punto
   exacto en que se detectó el fallo.
2. **Se solicita `shutdown()` del Core, si este ya fue inicializado** (paso 9 de la
   sección 4 ya completado). Su informe agregado de fallos se incorpora al rollback.
3. **Se liberan, en orden inverso al de creación, las dependencias externas creadas
   por el host** (última creada, primera liberada), consultando la pila de limpieza
   de la sección 8.1.
4. **Se recopilan todos los fallos de limpieza** producidos durante el paso anterior,
   cada uno envuelto como `HOST_EXTERNAL_DEPENDENCY_DISPOSE_FAILED`; si el propio
   proceso de limpieza, en su conjunto, no puede completarse de forma coherente, se
   añade adicionalmente `HOST_COMPOSITION_ROLLBACK_FAILED`.
5. **El host termina en `ERROR`.**
6. **El informe conserva tanto el error original (el fallo mandatorio que disparó el
   rollback) como todos los errores de rollback recopilados en el paso anterior,
   claramente distinguidos entre sí.** Un fallo durante la limpieza nunca sustituye
   ni oculta al error original: ambos son visibles en el `HostStatusReport` final.

Si el fallo ocurre **antes** de completar el paso 9 (Core aún no inicializado), el
paso 2 anterior no aplica (no hay Core que apagar) y solo se liberan los recursos
externos que ya existieran en ese momento (en la práctica, como mucho el
`StorageProvider`, dado que las dependencias externas del host se construyen en el
paso 10, posterior al paso 9).

### 8.3 Cancelación cooperativa durante la inicialización

`initialize()` (la secuencia completa de la sección 4) y la operación de apagado del
host **no se ejecutan simultáneamente sin coordinación**. Si se solicita el apagado
mientras el host todavía está en cualquiera de los estados
`VALIDATING_COMPOSITION`, `INITIALIZING_CORE`, `BUILDING_COMPONENTS` o
`REGISTERING_COMPONENTS`:

1. Se registra una **solicitud de cancelación** (un indicador cooperativo, consultado
   entre fases, no una interrupción forzosa).
2. **La fase atómica que esté ejecutándose en ese momento termina** (por ejemplo, si
   se está a mitad del paso 11 construyendo un componente concreto, esa construcción
   concreta concluye antes de comprobar la cancelación).
3. **No comienza la siguiente fase.**
4. Se ejecuta el mismo proceso de limpieza y rollback de la sección 8.2 (liberación
   en orden inverso de lo ya construido, agregación de fallos de limpieza).
5. **El estado final es `STOPPED`** si la cancelación y la limpieza concluyen sin
   ningún fallo no recuperable durante la propia limpieza.
6. **El estado final es `ERROR`** si la propia limpieza deja al host en una
   condición no recuperable (por ejemplo, un fallo de limpieza que a su vez impide
   determinar con certeza qué quedó liberado y qué no).

La distinción entre este resultado (`STOPPED`) y el de un fallo mandatorio (`ERROR`,
sección 8.2) es intencional: una cancelación es una interrupción **solicitada**
deliberadamente por quien usa la capa host, y su resultado normal es un apagado
correcto, no un error del sistema; un fallo mandatorio es una condición **no
solicitada** y su resultado es siempre `ERROR`, incluso si la limpieza posterior se
completa sin incidentes.

Este diseño **no requiere implementar todavía ningún mecanismo concreto de
cancelación** (por ejemplo, un token de cancelación): basta con que la arquitectura
defina puntos de comprobación cooperativos entre fases atómicas, tal como se ha hecho
aquí. Una futura implementación puede satisfacer estos puntos de comprobación con
cualquier mecanismo cooperativo equivalente, sin que ello requiera modificar la
secuencia de fases ni la máquina de estados de la sección 7.

---

## 9. Errores y resultados

### 9.1 Catálogo de errores propios del host

Todo error originado en la capa host se representa mediante `DWMError` (tipo
canónico único del sistema, ADR-002 §7), con códigos de un catálogo cerrado y propio,
prefijados `HOST_`:

- `HOST_INVALID_CONFIGURATION`
- `HOST_INVALID_MANIFEST`
- `HOST_DEPENDENCY_MISSING`
- `HOST_CIRCULAR_DEPENDENCY`
- `HOST_CAPABILITY_UNAVAILABLE`
- `HOST_MODULE_CONSTRUCTION_FAILED`
- `HOST_MODULE_REGISTRATION_FAILED`
- `HOST_ADAPTER_CONSTRUCTION_FAILED`
- `HOST_ADAPTER_REGISTRATION_FAILED`
- `HOST_CORE_INITIALIZATION_FAILED`
- `HOST_COMPONENT_SERVICE_UNAVAILABLE`
- `HOST_USE_CASE_FAILED`
- `HOST_COMPOSITION_CANCELLED`
- `HOST_COMPOSITION_ROLLBACK_FAILED`
- `HOST_EXTERNAL_DEPENDENCY_DISPOSE_FAILED`
- `HOST_SHUTDOWN_PARTIAL_FAILURE`
- `HOST_INVALID_STATE_TRANSITION`

Ningún código se añade al catálogo cerrado del propio Core; este catálogo es
independiente y pertenece exclusivamente a `packages/host`.

### 9.2 Recuperables y no recuperables

- **No recuperables** (transicionan el host a `ERROR` tras rollback):
  `HOST_INVALID_CONFIGURATION`, `HOST_CIRCULAR_DEPENDENCY`,
  `HOST_CORE_INITIALIZATION_FAILED`, cualquier fallo de construcción/registro de un
  componente mandatorio (directo o por propagación, sección 12), y
  `HOST_COMPOSITION_ROLLBACK_FAILED`.
- **Recuperables** (afectan solo al componente implicado, o representan un cierre
  deliberado): `HOST_DEPENDENCY_MISSING` y `HOST_CAPABILITY_UNAVAILABLE` sobre un
  componente opcional, `HOST_*_CONSTRUCTION_FAILED` / `HOST_*_REGISTRATION_FAILED`
  sobre un componente opcional, `HOST_COMPOSITION_CANCELLED` (resultado `STOPPED`,
  sección 8.3), `HOST_EXTERNAL_DEPENDENCY_DISPOSE_FAILED` aislado (se agrega, no
  aborta el resto de la limpieza), y `HOST_SHUTDOWN_PARTIAL_FAILURE` (el apagado
  normal siempre concluye en `STOPPED`).

### 9.3 Envoltura obligatoria

Toda excepción nativa o `DWMError` proveniente del Core que cruce hacia la capa host
se envuelve en un nuevo `DWMError` con código `HOST_*`, preservando la causa original
encadenada.

### 9.4 Resultados agregados

`HostStatusReport` agrega, como mínimo:

- El resultado de la composición: por cada componente declarado en
  `HostConfiguration`, una de las categorías de la sección 12.2 (registrado, omitido
  por configuración, omitido por dependencia, fallo de construcción, fallo de
  registro, rollback realizado), junto con el `DWMError` correspondiente cuando
  aplique.
- El error original y, por separado, la lista de errores de rollback, cuando el
  resultado final fue `ERROR` o una cancelación (sección 8).
- El resultado del último apagado normal: el informe agregado de
  `DWMCore.shutdown()`, más cualquier fallo propio de liberar dependencias externas
  del host.

### 9.5 Política de continuidad

Un fallo aislado en un componente opcional nunca detiene la composición ni el
apagado del resto del sistema. Un fallo en un componente mandatorio, en la
configuración del host, o en la propia inicialización del Core, sí detiene la
composición, dispara rollback, y transiciona el host a `ERROR`.

### 9.6 Información que nunca debe aparecer en un error, informe o registro futuro

Ningún `DWMError`, ningún `HostStatusReport`, y ningún registro que una futura
implementación de logging pudiera producir, contiene, en ninguno de sus campos
(mensaje, `detail`, metadatos, causa serializada), el valor de una credencial, token,
clave o cualquier material sensible. Un error relacionado con una dependencia de este
tipo identifica **qué dependencia** faltó o falló (su nombre declarativo), nunca **su
contenido**. Esta regla extiende, al ámbito de la capa host y de sus futuros
registros, la prohibición ya fijada en ADR-002 §5.7 de que un secreto viaje como
payload de un evento.

---

## 10. Configuración del host

`HostConfiguration` contiene exclusivamente la información necesaria para construir y
ejecutar la aplicación, nunca configuración funcional de negocio ni credenciales:

- **Ubicación lógica de `SISTEMA-DE-TRABAJO`**, usada para construir el
  `StorageProvider` que el Core necesita (sección 4, paso 7).
- **Componentes habilitados**: qué módulos y qué adaptadores debe componer la capa
  host, y cuáles son mandatorios frente a opcionales (sección 12).
- **Fábricas disponibles**: la asociación entre cada componente habilitado y la
  fábrica y el manifiesto (sección 11) que sabe construirlo.
- **Orden o fases de composición**: cualquier restricción adicional a la que ya
  impone el grafo de dependencias entre manifiestos.
- **Política de arranque**: la política por defecto de esta versión es la ya fijada
  en la sección 9.5 (un fallo mandatorio aborta toda la composición); esta versión no
  deja abierta ninguna variante alternativa.
- **Política de apagado**: el orden o agrupación en que la capa host libera sus
  propias dependencias externas tras invocar `shutdown()` del Core.

`HostConfiguration` **no** contiene credenciales bajo ninguna circunstancia. Tampoco
duplica la configuración normalizada que ya gestiona el Core (`NormalizedConfig`) ni
la configuración funcional propia de un futuro módulo.

---

## 11. Capacidades declarativas y `ComponentBundle`

### 11.1 Estrategia oficial de capacidades

La estrategia oficial es la ya fijada en la versión 1.0.0 y mantenida sin cambios:
**manifiestos externos asociados a las fábricas**, mantenidos y validados por
`CompositionRoot`. Se descartan ampliar `IModule`/`IAdapter`/`ModuleContext` (exigiría
tocar el Core congelado) e inferir capacidades en tiempo de ejecución (contradice
ADR-002 §11.2).

### 11.2 El problema que resuelve `ComponentBundle`

`IModule` e `IAdapter` describen exclusivamente ciclo de vida (identidad, versión,
`init`, `dispose` opcional); no contienen, ni deben contener, las operaciones de
negocio concretas que un coordinador necesita invocar (por ejemplo, "obtener una
credencial" o "detectar la versión instalada de una herramienta"). TDS-001 no propone
ningún cambio a esos contratos. En su lugar, formaliza que **toda fábrica devuelve un
`ComponentBundle`**, no directamente una instancia de `IModule`/`IAdapter`.

### 11.3 Contenido de `ComponentBundle`

Un `ComponentBundle` contiene tres elementos, con posesión y visibilidad distintas:

1. **La instancia de ciclo de vida**, conforme a `IModule` o `IAdapter`. Es lo
   **único** que `CompositionRoot` registra en el Core (`registerModule` /
   `registerAdapter`).
2. **Una superficie pública de dominio**, separada de la instancia de ciclo de vida:
   el conjunto de operaciones de negocio propias del componente (por ejemplo, para un
   componente de secretos, obtener un valor concreto; para un adaptador, detectar o
   verificar una herramienta). Esta superficie **no se registra en el Core** — el
   Core nunca la conoce ni la necesita. Queda en posesión exclusiva de
   `CompositionRoot`, que la entrega, de forma selectiva, únicamente a los
   coordinadores autorizados que la necesiten para un caso de uso concreto
   (sección 6).
3. **Su manifiesto ya validado** (sección 11.1), conservado por `CompositionRoot`
   para diagnóstico y para la construcción del `HostStatusReport`.

### 11.4 Garantías

- Un módulo no recibe la superficie pública de otro módulo, ni la de un adaptador, ni
  viceversa (sección 6.8).
- Los coordinadores reciben **solo** las superficies concretas que necesitan para el
  caso de uso que resuelven, nunca el conjunto completo de superficies disponibles.
- Las superficies públicas de dominio se expresan, igual que las dependencias
  externas (sección 5), mediante contratos mínimos, sustituibles por dobles de
  prueba sin necesidad de construir el componente real.
- Ni la existencia de `ComponentBundle` ni la separación entre ciclo de vida y
  superficie de dominio modifican `IModule`, `IAdapter` ni `ModuleContext`: son una
  convención propia de cómo la capa host organiza lo que sus fábricas producen, no
  una ampliación del contrato congelado del Core.

### 11.5 Garantías del manifiesto (sin cambios respecto de la estrategia ya fijada)

- No modifica el Core.
- No es un mecanismo de comunicación entre módulos: solo `CompositionRoot` lo lee,
  únicamente durante la composición.
- Se valida antes de construir nada costoso (sección 4, pasos 1-6).
- Se versiona (ADR-002 §12).
- Indica capacidades ofrecidas y requeridas.
- Permite detectar dependencias y capacidades ausentes antes de ejecutar cualquier
  operación.

---

## 12. Componentes mandatorios y opcionales

1. **Un componente mandatorio que falla** (en construcción, registro, dependencia
   ausente o capacidad incompatible) **aborta la inicialización completa y activa el
   rollback** (sección 8.2).
2. **Un componente opcional que falla se omite**, y la composición continúa con el
   resto.
3. **Un componente opcional del que depende uno mandatorio convierte indirectamente
   el fallo en mandatorio.** Si el componente mandatorio `A` requiere una capacidad
   provista únicamente por el componente opcional `B`, y `B` falla, el fallo de `B`
   se trata, a todos los efectos de la política de la sección 8.2, como si `A` mismo
   hubiera fallado: se aborta la inicialización completa.
4. **Un componente opcional del que solo dependen componentes opcionales provoca que
   se omita todo el subgrafo dependiente.** Si `B` (opcional) falla y únicamente
   componentes opcionales `C`, `D`, ... dependen de `B`, ninguno de `C`, `D`, ... se
   construye (su requisito no está satisfecho); todos ellos se registran en el
   informe como "omitido por dependencia", y la composición continúa con el resto del
   grafo que no dependa transitivamente de `B`.
5. **Ningún componente se construye si sus requisitos obligatorios no están
   satisfechos.** Esta comprobación ocurre en el paso 5 de la sección 4, antes de
   construir nada, recorriendo el grafo completo (no solo las dependencias directas)
   para determinar el subgrafo afectado por cualquier fallo o ausencia detectada.

### 12.1 Determinación del subgrafo afectado

`CompositionRoot` calcula, a partir del grafo de dependencias (paso 4 de la sección
4), el conjunto de componentes cuyo requisito (directo o transitivo) no puede
satisfacerse. Este cálculo se realiza **antes** de construir cualquier componente
(paso 5), de forma que ninguna fábrica se invoca nunca para un componente cuyos
requisitos ya se sabe que no se cumplirán.

### 12.2 Categorías del informe

`HostStatusReport` distingue, para cada componente declarado en `HostConfiguration`,
exactamente una de las siguientes categorías:

- **Registrado**: se construyó y se registró con éxito.
- **Omitido por configuración**: no estaba habilitado en `HostConfiguration`.
- **Omitido por dependencia**: no se construyó porque un requisito suyo (directo o
  transitivo) no estaba disponible (sección 12, puntos 3-4).
- **Fallo de construcción**: su fábrica fue invocada pero falló.
- **Fallo de registro**: se construyó pero el Core rechazó su registro.
- **Rollback realizado**: había sido registrado con éxito, pero un fallo mandatorio
  posterior disparó un rollback que lo retiró (sección 8.2).

---

## 13. Consulta de estado

La operación pública de obtener estado (sección 15) funciona en **todos** los estados
del host, pero adapta lo que consulta del Core según corresponda, para no invocar
nunca una operación que la API del propio Core rechazaría en su estado actual
(Core, README §14 — guardas de ciclo de vida):

- **Antes de crear `DWMCore`** (host en `CREATED` o durante la parte de
  `VALIDATING_COMPOSITION` anterior al paso 7 de la sección 4): la consulta devuelve
  el estado propio del host y un indicador explícito de que el estado del Core no
  está disponible (no existe instancia que consultar).
- **Con `DWMCore` creado pero todavía no inicializado con éxito** (durante
  `INITIALIZING_CORE`, antes de que el paso 9 concluya): la consulta devuelve el
  estado propio del host y, del Core, únicamente lo que sus propias operaciones sin
  guarda permiten en cualquier estado (`getLifecycleState()`), sin invocar
  `getSnapshot()` ni ninguna operación que el Core rechazaría antes de `READY`.
- **Con `DWMCore` inicializado** (`BUILDING_COMPONENTS`, `REGISTERING_COMPONENTS`,
  `READY`, `RUNNING`): la consulta combina el estado propio del host con el snapshot
  agregado del Core (`getSnapshot()`, disponible desde `READY` en adelante según la
  propia guarda del Core).
- **Después de `ERROR`**: la consulta devuelve el último snapshot válido del Core que
  se haya podido obtener antes del fallo (si el Core llegó a alcanzar un estado en
  que `getSnapshot()` era una operación válida), junto con el error principal que
  causó el `ERROR` y, si los hubo, los errores de rollback (sección 8.2, sección
  9.4). Si el Core nunca llegó a inicializarse, no hay snapshot que mostrar y la
  consulta lo indica explícitamente en lugar de intentar obtenerlo.
- **Después de `STOPPED`**: la consulta devuelve el estado final del host y el
  último `HostStatusReport` de apagado producido (sección 9.4).

En ningún caso la operación de consulta de estado invoca `getSnapshot()` u otra
operación de la API pública del Core en un estado del Core en el que esa operación
sería rechazada; la propia consulta de estado del host decide, según su propio
estado interno, qué subconjunto de la API del Core es seguro invocar en cada momento.

---

## 14. Estructura del paquete

Estructura conceptual, actualizada, del futuro paquete `packages/host/` (aún no
creado):

```
packages/host/
├── README.md
├── src/
│   ├── host/            # ApplicationHost: fachada pública, máquina de estados
│   │                    # propia (sección 7), política de uso único.
│   ├── composition/      # CompositionRoot: validación de manifiestos, grafo de
│   │                    # dependencias, orden topológico, DependencyContainer
│   │                    # (acceso exclusivo), construcción y registro.
│   ├── factories/        # Abstracción ModuleFactory/AdapterFactory; sin fábricas
│   │                    # concretas todavía. Producen ComponentBundle.
│   ├── bundles/          # Forma conceptual de ComponentBundle: separación entre
│   │                    # instancia de ciclo de vida, superficie pública de
│   │                    # dominio, y manifiesto.
│   ├── manifests/        # Forma conceptual del manifiesto: identidad, capacidades
│   │                    # provistas/requeridas, dependencias externas declaradas,
│   │                    # versión.
│   ├── coordinators/      # UseCaseCoordinator(s), LifecycleCoordinator,
│   │                    # ShutdownCoordinator (incluye la lógica de rollback y de
│   │                    # cancelación cooperativa, sección 8).
│   ├── contracts/        # Formas mínimas de las dependencias externas (sección 5)
│   │                    # y de las superficies públicas de dominio mínimas y
│   │                    # sustituibles.
│   ├── config/            # HostConfiguration: definición, carga y validación.
│   ├── errors/             # HostErrorCatalog y utilidades de envoltura (sección 9),
│   │                    # incluidos los códigos de rollback.
│   └── status/             # HostStatusReport: definición y agregación, incluidas
│                        # las categorías de la sección 12.2 y la distinción entre
│                        # error original y errores de rollback.
└── tests/
    ├── unit/              # Cada pieza probada de forma aislada, con dobles.
    └── integration/        # Composición completa contra un DWMCore real.
```

Ningún archivo de esta estructura se crea todavía en esta fase.

---

## 15. API pública propuesta

Descripción puramente conceptual; ninguna firma de TypeScript, ninguna interfaz.

1. **Crear el host.** Entrada: una `HostConfiguration` (y el conjunto de
   manifiestos/fábricas disponibles). Salida: una instancia del host en `CREATED`.
   Comportamiento: valida la forma de la configuración recibida; ningún efecto
   secundario adicional.
2. **Inicializarlo.** Entrada: ninguna adicional. Salida: el host transicionado a
   `READY` (o a `ERROR`, con el `HostStatusReport` de composición disponible en
   ambos casos). Comportamiento: ejecuta los pasos 1-14 de la sección 4, en el
   estado `VALIDATING_COMPOSITION` → `INITIALIZING_CORE` → `BUILDING_COMPONENTS` →
   `REGISTERING_COMPONENTS` → `READY`. Solo válida desde `CREATED` (sección 7.6).
3. **Iniciar la ejecución (`start`).** Entrada: ninguna. Salida: el host
   transicionado a `RUNNING`, o rechazo si no estaba en `READY`. Comportamiento:
   invoca `markRunning()` sobre el Core (paso 15 de la sección 4).
4. **Obtener estado.** Entrada: ninguna. Salida: la vista descrita en la sección 13,
   adaptada al estado actual del host. Comportamiento: operación de solo lectura,
   disponible en cualquier estado.
5. **Ejecutar casos de uso.** Entrada: un identificador del caso de uso más los
   datos mínimos que requiera (sección 6). Salida: el resultado explícito y
   agregado de ese caso de uso. Comportamiento: delega en el `UseCaseCoordinator`
   correspondiente; solo disponible en `RUNNING` (sección 7.4).
6. **Apagarlo.** Entrada: ninguna. Salida: el host transicionado a `STOPPED` (apagado
   normal o cancelación exitosa) o a `ERROR` (si la propia limpieza falla de forma no
   recuperable). Comportamiento: ejecuta la secuencia de apagado o de cancelación
   cooperativa (sección 8), produciendo un `HostStatusReport`. Válida desde
   cualquier estado anterior a `STOPPED`/`ERROR` (sección 7.4).
7. **Consultar el resultado del último apagado.** Entrada: ninguna. Salida: el
   último `HostStatusReport` de apagado producido, si existe. Comportamiento:
   operación de solo lectura, disponible incluso después de `STOPPED` o `ERROR`.

Ninguna de estas operaciones permite reinicializar una instancia ya avanzada más allá
de `CREATED` (sección 7.6): para un nuevo intento, se crea una nueva instancia
mediante la operación 1.

---

## 16. Estrategia de pruebas

La futura implementación de `packages/host` deberá superar, como mínimo:

1. **Validación completa antes de construir componentes**: verificar que ninguna
   fábrica se invoca mientras quede pendiente cualquier comprobación de manifiestos,
   capacidades o ciclos (sección 4).
2. **Orden topológico**: verificar que los componentes se construyen y registran en
   un orden que respeta el grafo de dependencias declarado.
3. **Fábrica sin acceso a `DependencyContainer`**: verificar, estructuralmente, que
   ninguna fábrica de prueba puede alcanzar el contenedor ni realizar una búsqueda
   dinámica; solo recibe el conjunto explícito de dependencias que se le entrega.
4. **`ComponentBundle` correctamente separado**: verificar que solo la instancia de
   ciclo de vida llega al Core (`registerModule`/`registerAdapter`) y que la
   superficie pública de dominio nunca se registra ni es accesible desde el Core.
5. **Coordinadores sin comunicación directa entre módulos**: verificar que un doble
   de módulo y un doble de adaptador nunca reciben, el uno del otro, una referencia
   directa; solo el coordinador de prueba sostiene ambas superficies.
6. **Fallo mandatorio con rollback**: verificar que un fallo en un componente
   mandatorio dispara la liberación en orden inverso de todo lo ya construido, y que
   el host termina en `ERROR`.
7. **Varios fallos durante rollback**: verificar que múltiples fallos de limpieza se
   agregan (`HOST_EXTERNAL_DEPENDENCY_DISPOSE_FAILED` repetido,
   `HOST_COMPOSITION_ROLLBACK_FAILED` si procede) sin que ninguno oculte al error
   original.
8. **Cancelación durante cada fase de inicialización**: un escenario por cada uno de
   los estados `VALIDATING_COMPOSITION`, `INITIALIZING_CORE`, `BUILDING_COMPONENTS` y
   `REGISTERING_COMPONENTS`, verificando que la fase en curso concluye, que no
   empieza la siguiente, y que el resultado final es `STOPPED` (limpieza sin
   incidentes) o `ERROR` (limpieza con incidentes no recuperables).
9. **Consulta de estado antes de crear el Core**: verificar que se indica
   explícitamente que el estado del Core no está disponible, sin lanzar ni invocar
   `getSnapshot()`.
10. **Consulta de estado tras `ERROR`**: verificar que se devuelve el último
    snapshot válido disponible (si lo hubo) junto con el error principal y los
    errores de rollback.
11. **Consulta de estado tras `STOPPED`**: verificar que se devuelve el último
    `HostStatusReport` de apagado.
12. **Intento de reinicialización tras `ERROR`**: verificar el rechazo explícito
    (`HOST_INVALID_STATE_TRANSITION`) al invocar la inicialización sobre la misma
    instancia.
13. **Intento de reinicialización tras `STOPPED`**: mismo rechazo explícito.
14. **Omisión transitiva de componentes opcionales**: verificar que, si un
    componente opcional falla, todo el subgrafo de componentes opcionales que
    dependen de él (directa o transitivamente) queda correctamente marcado como
    "omitido por dependencia", sin intentar construir ninguno de ellos.
15. **Componente mandatorio dependiente de uno opcional fallido**: verificar que el
    fallo del componente opcional se propaga como fallo mandatorio (aborta e inicia
    rollback), tal como exige la sección 12, punto 3.
16. **Preservación del error original durante rollback**: verificar explícitamente
    que el `HostStatusReport` final conserva, distinguibles entre sí, el error que
    disparó el rollback y cada error individual ocurrido durante la propia limpieza.
17. **Ausencia de importaciones directas entre módulos**: verificación, a nivel de
    revisión de dependencias del código, de que ningún doble de módulo o adaptador
    importa a otro.
18. **Comprobación de que el Core no se modifica**: verificación explícita de que
    ningún archivo de `packages/core` se altera al ejecutar la suite de
    `packages/host`.

### 16.1 Objetivos mínimos de cobertura

Los mismos umbrales ya exigidos al Core, aplicados a `packages/host`, configurados de
forma que hagan fallar la ejecución de pruebas si no se alcanzan:

- 90% líneas
- 90% funciones
- 85% ramas
- 90% sentencias

---

## 17. Criterios de aceptación

La capa host se considera implementable, y una futura implementación concreta se
considera conforme a este diseño, si y solo si cumple lo siguiente:

1. **Sigue un único orden de inicialización** (sección 4), sin variantes entre
   secciones ni entre la implementación y este documento.
2. **Valida manifiestos, capacidades, dependencias y ciclos antes de construir
   cualquier componente o dependencia externa costosa** (sección 4).
3. **Las fábricas no tienen acceso al `DependencyContainer`** ni a `DWMCore`;
   reciben únicamente un conjunto explícito de dependencias ya resueltas
   (sección 2.4, sección 3).
4. **Separa el ciclo de vida registrable de la superficie pública de dominio de cada
   componente** mediante `ComponentBundle` (sección 11), sin modificar `IModule`,
   `IAdapter` ni `ModuleContext`.
5. **El rollback es determinista**: libera en orden inverso exactamente lo que se
   había construido, preserva el error original junto con los errores de limpieza, y
   siempre concluye en `ERROR` o `STOPPED` según corresponda (sección 8).
6. **Soporta cancelación cooperativa** durante cualquier fase de inicialización, sin
   requerir un mecanismo de cancelación concreto todavía (sección 8.3).
7. **La consulta de estado es segura en cualquier fase**: nunca invoca una operación
   de la API del Core que este rechazaría en su estado actual (sección 13).
8. **Una instancia de `ApplicationHost` es de un solo uso**: no se reinicializa tras
   `ERROR` ni tras `STOPPED`; un nuevo intento exige una nueva instancia
   (sección 7.6).
9. **No existe comunicación directa entre módulos y adaptadores** en ningún ejemplo,
   pieza o flujo descrito: todo cruce entre componentes pasa por un coordinador que
   sostiene sus superficies de dominio por separado (sección 6).
10. **No requiere modificar `@dwm/core`, ADR-001, ADR-002 ni FRS-001.**

---

## 18. Glosario

- **Capa host / raíz de composición:** capa externa al Core y a los módulos,
  descrita arquitectónicamente en ADR-002 §17 y diseñada técnicamente en este
  documento.
- **`ApplicationHost`:** fachada pública del paquete `@dwm/host`, de un solo uso por
  instancia (sección 7.6).
- **`CompositionRoot`:** pieza que valida, construye y registra módulos y
  adaptadores a partir de manifiestos y fábricas; única con acceso al
  `DependencyContainer`.
- **Fábrica (`ModuleFactory`/`AdapterFactory`):** unidad que produce un
  `ComponentBundle` a partir de un conjunto explícito de dependencias ya resueltas;
  no conoce `DependencyContainer` ni `DWMCore`.
- **`DependencyContainer`:** mecanismo explícito, de acceso exclusivo de
  `CompositionRoot`, que almacena dependencias externas ya construidas.
- **`ComponentBundle`:** resultado de toda fábrica; agrupa la instancia de ciclo de
  vida (registrable en el Core), la superficie pública de dominio (no registrable,
  de posesión exclusiva de `CompositionRoot` y de los coordinadores autorizados), y
  el manifiesto validado.
- **Superficie pública de dominio:** conjunto de operaciones de negocio de un
  componente, distinto de su ciclo de vida (`IModule`/`IAdapter`), nunca conocido
  por el Core ni por otros componentes, entregado selectivamente por
  `CompositionRoot` a los coordinadores que lo necesiten.
- **`UseCaseCoordinator`:** pieza que coordina la colaboración entre superficies
  públicas de dominio de componentes ya construidos para resolver una operación
  concreta.
- **`LifecycleCoordinator` / `ShutdownCoordinator`:** piezas que secuencian el
  arranque y el apagado (incluido rollback y cancelación) del host en relación con
  el ciclo de vida del Core.
- **`HostConfiguration`:** estructura de datos pasiva que describe cómo ensamblar y
  ejecutar la aplicación; nunca contiene credenciales.
- **`HostErrorCatalog`:** catálogo cerrado de códigos de error propios de la capa
  host, con prefijo `HOST_`.
- **`HostStatusReport`:** estructura de datos de solo lectura que agrega el
  resultado de composición, registro, rollback y apagado.
- **Manifiesto:** descriptor externo, versionado, asociado a una fábrica, que
  declara identidad, capacidades provistas/requeridas y dependencias externas de un
  componente, sin modificar el Core.
- **Dependencia externa:** infraestructura que un módulo necesita y que
  `ModuleContext` no provee, entregada por la capa host durante la construcción.
- **Componente mandatorio / opcional:** clasificación, declarada en
  `HostConfiguration`, de si el fallo de un componente aborta toda la inicialización
  (mandatorio, directo o por propagación, sección 12) o solo omite su subgrafo
  dependiente (opcional).
- **Rollback:** liberación, en orden inverso de creación, de todo recurso construido
  por el host, disparada por un fallo mandatorio o por una cancelación durante la
  inicialización (sección 8).
- **Cancelación cooperativa:** solicitud de apagado registrada durante la
  inicialización, que se atiende entre fases atómicas (nunca interrumpiendo una fase
  en curso) y que concluye en `STOPPED` si la limpieza no encuentra fallos no
  recuperables, o en `ERROR` en caso contrario.
- **Instancia de un solo uso:** política por la cual una instancia de
  `ApplicationHost` que alcanza `ERROR` o `STOPPED` no puede reinicializarse; todo
  reintento requiere una instancia nueva.

---

## 19. Control de versiones del documento

| Versión | Fecha | Descripción | Estado |
|---|---|---|---|
| 1.0.0 | 2026-07-28 | Versión inicial. Convierte ADR-002 §17 en un diseño técnico implementable para el futuro paquete `packages/host`. | Aceptado |
| 1.0.1 | 2026-07-28 | Corrección de contradicciones técnicas: (1) unificación del flujo de inicialización (sección 4) y la máquina de estados del host (sección 7) en un único orden oficial de 15 pasos y 9 estados; (2) formalización de `ComponentBundle` como separación explícita entre ciclo de vida registrable y superficie pública de dominio, sin modificar `IModule`/`IAdapter`/`ModuleContext`; (3) corrección del acceso al `DependencyContainer`, exclusivo de `CompositionRoot`, y de las fábricas, que ya no lo consultan ni conocen a `DWMCore`; (4) incorporación de una política transaccional de rollback y limpieza por pila inversa, y de cancelación cooperativa durante la inicialización, con nuevos códigos `HOST_COMPOSITION_ROLLBACK_FAILED`, `HOST_EXTERNAL_DEPENDENCY_DISPOSE_FAILED` y `HOST_COMPOSITION_CANCELLED`; (5) cierre definitivo de la política de reinicialización: una instancia de `ApplicationHost` es de un solo uso, sin políticas futuras abiertas; (6) corrección del ejemplo de coordinación entre un módulo y un adaptador, de forma que ninguno de los dos recibe una referencia del otro; (7) definición explícita de la consulta segura de estado en cada fase del ciclo de vida, incluyendo antes de crear el Core, tras `ERROR` y tras `STOPPED`; (8) formalización de la propagación mandatorio/opcional y de las categorías del informe de composición. No se declara ningún cambio de arquitectura del Core, de ADR-001, de ADR-002 ni de FRS-001. | Aceptado |

**Nota de gobernanza:** cualquier modificación futura de este documento debe
realizarse mediante una nueva versión que referencie explícitamente TDS-001,
indicando qué sección modifica y por qué. TDS-001 no se edita retroactivamente salvo
corrección de erratas que no alteren su contenido decisional. TDS-001 no modifica, y
no puede modificar, el contenido de ADR-001, ADR-002 ni FRS-001, ni el código de
`packages/core`.

---

*Fin del documento — TDS-001 — Dev Workspace Manager (DWM)*
