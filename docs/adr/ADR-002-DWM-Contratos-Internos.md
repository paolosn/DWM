# ADR-002 — Contratos Internos del Sistema

**Proyecto:** Dev Workspace Manager
**Abreviatura:** DWM
**Tipo de documento:** Architecture Decision Record (ADR) — contrato transversal
**Documentos de referencia previos:** ADR-001 (Arquitectura Oficial), FRS-001
(Especificación Funcional), DWM Core (`packages/core`, congelado)
**Estado:** Aceptado — Referencia obligatoria para todo módulo, adaptador o
componente que se implemente a partir de esta fase
**Versión:** 1.0.1
**Fecha:** 2026-07-28

---

## Índice

1. Filosofía de los contratos internos
2. Reglas de comunicación entre módulos
3. Contrato base de un módulo
4. Contrato base de un adaptador
5. Contrato para eventos
6. Contrato para estados
7. Contrato para errores
8. Contrato para configuración
9. Contrato para almacenamiento
10. Contrato para operaciones asíncronas
11. Contrato para capacidades (capabilities)
12. Contrato para versionado
13. Compatibilidad entre contratos
14. Estrategia de deprecación
15. Reglas para futuras ampliaciones
16. Ejemplos conceptuales de implementación (sin código)
17. Capa Host y raíz de composición
18. Glosario
19. Control de versiones del documento

---

## 0. Alcance y relación con los documentos previos

ADR-002 no sustituye ni reinterpreta ADR-001 ni FRS-001: los da por asumidos y
**desciende un nivel de abstracción**. Donde ADR-001 define módulos, adaptadores y
principios de diseño, y FRS-001 define comportamiento observable por el usuario,
ADR-002 define el **contrato interno** — la forma exacta en que cualquier módulo o
adaptador debe presentarse ante el Core y ante los demás módulos para poder
integrarse, sin que el Core necesite conocer su lógica de negocio.

ADR-002 tampoco modifica el Core. El Core (`packages/core`) queda **congelado** en
esta fase: los contratos descritos aquí son compatibles con lo que el Core ya expone
(`IModule`, `IAdapter`, `ModuleContext`, `ScopedEventBus`, `SystemStatus`, `DWMError`,
`ConfigManager`/`StorageProvider`, validación de identidad y semver) y lo **amplían**
únicamente en la capa de convención que deben seguir los módulos que se construyan
sobre él, no en la superficie que el Core ya expone. Ningún módulo puede exigir al
Core un cambio de comportamiento para cumplir este documento: si un módulo necesita
algo que el Core no ofrece, ese módulo debe resolverlo dentro de sí mismo o mediante
convención con otros módulos, nunca modificando el Core.

Toda referencia a "el Core" en este documento se refiere exclusivamente a la
superficie pública ya congelada de `@dwm/core`.

En particular, `ModuleContext` —la única superficie que un módulo o adaptador recibe
del Core durante su inicialización— contiene exactamente cuatro elementos: el bus de
eventos con alcance restringido (`eventBus`), la consulta de configuración normalizada
(`getConfig`), la consulta del perfil activo (`getActiveProfile`) y el reporte de
estado propio (`reportStatus`). No contiene acceso al registro de módulos, al registro
de adaptadores, a un mecanismo de invocación de capacidades de otros componentes, ni a
ningún proveedor de almacenamiento. Cualquier necesidad de un módulo que exceda esos
cuatro elementos se resuelve mediante la **capa host y raíz de composición** (sección
17), nunca ampliando `ModuleContext` ni el resto de la superficie congelada del Core.
Este documento no da por supuesta ninguna capacidad de `ModuleContext` que no esté en
esa lista.

---

## 1. Filosofía de los contratos internos

1. **Un contrato es una promesa, no una implementación.** Define qué forma debe tener
   un componente y qué se puede esperar de él; nunca cómo debe construirse
   internamente. Dos módulos pueden cumplir el mismo contrato de maneras
   completamente distintas.
2. **El Core es agnóstico por diseño.** Los contratos existen precisamente para que
   el Core pueda coordinar módulos y adaptadores sin conocer su dominio (herramientas
   concretas, sistemas operativos concretos, proveedores de IA concretos). Un
   contrato bien definido es el que permite al Core tratar a cualquier módulo como
   una caja opaca con una interfaz conocida.
3. **La estabilidad del contrato es más importante que la comodidad puntual de un
   módulo.** Ningún módulo puede justificar una excepción al contrato alegando que
   "en su caso es distinto"; si un caso genuinamente distinto aparece, se resuelve
   ampliando el contrato de forma explícita (sección 15), nunca incumpliéndolo en
   silencio.
4. **Todo lo que no está en el contrato no está garantizado.** Un módulo no puede
   depender de comportamiento incidental de otro módulo o del Core que no esté
   descrito en este documento o en ADR-001/FRS-001. Si algo no está prometido, puede
   cambiar sin aviso.
5. **Los contratos se validan en los límites, no se confía en ellos por convención.**
   Siempre que sea posible, el cumplimiento de un contrato (identidad, versión,
   formato) se comprueba activamente en el punto de entrada (por ejemplo, al
   registrar un módulo), en lugar de asumirse. Esto ya es así en el Core y debe
   mantenerse como principio para toda comunicación entre módulos.
6. **Explícito antes que implícito.** Un módulo que necesita algo de otro (datos,
   una capacidad, un evento) lo declara de forma explícita — por ejemplo, mediante
   metadatos de capacidades (sección 11) o mediante configuración — en lugar de
   asumirlo implícitamente. La resolución de esa necesidad entre dos módulos
   concretos, cuando exige coordinación directa, corresponde a la capa host y raíz
   de composición (sección 17), nunca a una llamada directa de un módulo hacia otro.

---

## 2. Reglas de comunicación entre módulos

1. **Ningún módulo se comunica directamente con otro módulo.** Toda comunicación
   pasa por infraestructura provista por el Core: el bus de eventos
   (`ModuleContext.eventBus`) para comunicación desacoplada, o la configuración
   normalizada para datos compartidos de forma declarativa. Un módulo nunca importa,
   referencia ni invoca directamente el código de otro módulo.
2. **Ningún módulo recibe una referencia al Core completo.** La única superficie que
   un módulo o adaptador recibe es el contexto mínimo que el Core entrega en su
   inicialización (`ModuleContext`, ya definido y congelado). Esto es una regla de
   comunicación, no solo de implementación: ningún contrato futuro puede ampliar esa
   superficie sin pasar por un nuevo ADR.
3. **La comunicación de dominio se realiza por eventos con namespace propio.** Cada
   módulo publica sus eventos bajo un namespace que lo identifica de forma
   inequívoca (convención: `<dominio>:<evento>`, por ejemplo `tooling:tool-installed`
   o `ai:provider-connected`), nunca bajo el namespace `core:*`, reservado en
   exclusiva al Core (ADR-001, README del Core §7).
4. **Un módulo no debe asumir el orden de inicialización de otros módulos.** El
   registro de módulos y adaptadores es una operación explícita e independiente por
   componente (sección 3 de este documento); ningún módulo puede depender de que
   otro módulo concreto ya esté registrado en el momento de su propia
   inicialización. Si una dependencia de orden es genuinamente necesaria, se declara
   como capacidad requerida (sección 11), no como suposición implícita.
5. **La comunicación entre módulos es de igual a igual.** Ningún módulo tiene
   autoridad sobre otro: ningún módulo puede registrar, desregistrar o modificar el
   estado de otro módulo. La única autoridad de registro y ciclo de vida reside en el
   Core.
6. **Los datos compartidos se comunican por valor, no por referencia mutable.**
   Cuando un módulo necesita comunicar datos a otro (vía evento o configuración), lo
   hace de forma que el receptor no pueda mutar accidentalmente el estado interno del
   emisor. Esta regla generaliza al ámbito de todo el sistema el principio de
   inmutabilidad externa que el Core ya aplica a su propia API pública.

---

## 3. Contrato base de un módulo

Todo módulo del sistema (Tooling Manager, AI Manager, Secrets Manager, Profile
Manager, Project Manager, Plugin Manager, Backup Manager, Restore Manager, Migration
Manager, Verification Manager, Log Manager, Status Manager, y cualquier módulo
futuro) debe satisfacer, sin excepción, los siguientes elementos:

1. **Identidad estable.** Un identificador único e inmutable durante toda la vida
   del módulo, sin espacios iniciales o finales, no vacío. Este identificador es la
   clave con la que el resto del sistema lo reconoce.
2. **Versión propia.** Una versión semántica (sección 12) que describe la versión
   del propio módulo, independiente de la versión del contrato que implementa.
3. **Versión de contrato declarada.** Una versión semántica que indica qué versión
   del contrato descrito en este documento implementa el módulo. Esta versión es la
   que se evalúa para decidir compatibilidad (sección 13), no la versión propia del
   módulo.
4. **Ciclo de vida de inicialización y liberación.** Un módulo expone una operación
   de inicialización (obligatoria) y, si necesita liberar recursos, una operación de
   liberación (opcional). Ambas se comportan según el contrato de operaciones
   asíncronas (sección 10) y según la política de baja segura ya establecida por el
   Core (retirada del registro incondicional antes de invocar la liberación).
5. **Recepción exclusiva de contexto mínimo desde el Core.** La única información e
   infraestructura que un módulo recibe *del Core* durante su inicialización llega a
   través de `ModuleContext` (bus de eventos con alcance restringido, configuración,
   perfil activo, reporte de estado); un módulo no debe intentar obtener acceso a
   infraestructura del Core por ninguna otra vía. Cualquier otra dependencia externa
   que un módulo necesite (por ejemplo, su propio acceso a almacenamiento, sección 9)
   no proviene del Core ni de `ModuleContext`: se le proporciona antes de su registro,
   durante su construcción, por la capa host y raíz de composición (sección 17).

6. **Reporte de estado propio.** Un módulo es responsable de comunicar su propio
   estado (sección 6) a través del mecanismo de reporte provisto en su contexto,
   tanto durante la inicialización como durante su operación posterior. Un módulo
   que no reporta su estado se considera, por defecto, en estado operativo una vez
   completada su inicialización con éxito.
7. **No injerencia en otros módulos.** Un módulo no registra, desregistra, consulta
   el estado interno ni invoca operaciones de otro módulo directamente; toda
   interacción respeta la sección 2.
8. **Ausencia de lógica de plataforma o herramienta en el módulo funcional.** Un
   módulo funcional (por ejemplo, un futuro Tooling Manager) no contiene lógica
   específica de una herramienta o sistema operativo concretos; esa lógica se
   delega siempre a un adaptador (sección 4), consistente con ADR-001 §8.

Este contrato base es el mismo, sin distinción, para todo módulo, independientemente
de su dominio funcional. Ningún módulo puede declarar una versión de exención parcial
de alguno de estos ocho elementos.

---

## 4. Contrato base de un adaptador

Un adaptador satisface todos los elementos del contrato base de módulo (sección 3) y,
adicionalmente:

1. **Sujeto declarado.** Un adaptador declara de forma explícita el identificador
   opaco de aquello que gestiona (una herramienta concreta, un sistema operativo
   concreto). Este identificador no es interpretado por el Core ni por ningún otro
   módulo: es responsabilidad exclusiva de quien consume el adaptador (por ejemplo,
   un futuro Tooling Manager) saber qué significa.
2. **Unicidad de sujeto.** Dos adaptadores activos no pueden declarar el mismo
   sujeto simultáneamente; esta regla ya está aplicada por el Core en el momento del
   registro y debe respetarse igualmente en cualquier capa superior que gestione
   adaptadores de forma indirecta.
3. **Encapsulación total de la lógica específica.** Toda diferencia de
   comportamiento entre sistemas operativos o entre herramientas concretas vive
   exclusivamente dentro del adaptador. Ningún módulo funcional que consuma un
   adaptador puede contener ramas de código condicionadas por el sujeto gestionado:
   si necesita comportamiento distinto según el sujeto, ese comportamiento distinto
   debe residir en el propio adaptador, expuesto a través de sus capacidades
   (sección 11).
4. **Sustituibilidad.** Un adaptador debe poder reemplazarse por otro que declare el
   mismo sujeto y sea compatible en versión de contrato, sin que el módulo que lo
   consume requiera ningún cambio. Esta es la propiedad central que justifica la
   existencia de la arquitectura de adaptadores (ADR-001 §8).
5. **No acumulación de estado ajeno al sujeto.** Un adaptador solo mantiene estado
   relativo a su propio sujeto; no acumula ni cachea información sobre otros
   sujetos o sobre el sistema en general.

---

## 5. Contrato para eventos

1. **Namespace propio obligatorio.** Todo módulo o adaptador que emite eventos de
   dominio lo hace bajo un namespace que lo identifica (`<dominio>:<evento>`). Un
   componente no puede emitir eventos sin namespace ni bajo un namespace genérico
   compartido con otros componentes.
2. **Namespace `core:*` reservado.** Ningún módulo ni adaptador puede emitir un
   evento bajo el namespace `core:*`; esta restricción ya está aplicada de forma
   activa por el Core (rechazo explícito al intentar emitirlo) y se considera
   contrato cerrado, no solo convención.
3. **Suscripción abierta, emisión restringida.** Cualquier componente puede
   suscribirse a cualquier evento visible en el bus, incluidos los eventos `core:*`
   y los eventos de dominio de otros módulos. La restricción del namespace
   reservado aplica únicamente a la emisión, nunca a la escucha.
4. **Los eventos son notificaciones, no contratos de retorno.** Un evento comunica
   únicamente un hecho ya ocurrido o un cambio de estado; emitirlo no espera ni exige
   una respuesta de los suscriptores, y ningún suscriptor debe emitir un evento
   propio con la intención de que se interprete como "respuesta" correlacionada con
   el evento original. Si dos componentes necesitan una interacción de tipo
   solicitud-respuesta, esa necesidad no se resuelve mediante eventos: se resuelve
   mediante la capa host y raíz de composición (sección 17), usando la API pública
   del Core.
5. **Los eventos no se usan como mecanismo de solicitud-respuesta ni como RPC.**
   Queda prohibido construir sobre el bus de eventos cualquier patrón que dependa de
   correlación entre un evento emitido y otro evento posterior, de espera de
   respuesta, de tiempo de espera (timeout), de cancelación, o que deba resolver
   duplicidad de respuestas o ausencia de receptor. Estas son precisamente las
   categorías de problemas que el bus de eventos, por diseño, no resuelve: es un
   mecanismo de notificación desacoplada, no un mecanismo de invocación.
6. **Los eventos no se usan para ejecutar comandos.** Un evento nunca se emite con la
   intención de que un suscriptor concreto ejecute una acción a petición del emisor;
   ejecutar una acción a petición de otro componente es una invocación, no una
   notificación, y como tal queda fuera del contrato de eventos (ver capa host,
   sección 17).
7. **Ningún secreto viaja jamás como payload de un evento.** Ninguna credencial,
   token, clave o material sensible se publica en el bus de eventos bajo ninguna
   circunstancia, ni siquiera de forma transitoria o cifrada. La obtención y entrega
   controlada de un secreto para una operación concreta es responsabilidad exclusiva
   de la capa host y raíz de composición (sección 17), nunca del bus de eventos.
8. **Aislamiento de fallos entre suscriptores.** Un suscriptor que falla al procesar
   un evento no debe impedir que los demás suscriptores del mismo evento se
   ejecuten. Esta garantía ya la ofrece el bus de eventos del Core y todo módulo
   debe asumirla como parte del contrato, no reimplementarla.
9. **Estabilidad del catálogo propio.** Un módulo que documenta su propio catálogo
   de eventos de dominio debe tratarlo con la misma disciplina de versionado que el
   Core aplica a `core:*`: los eventos documentados de un módulo son parte de su
   contrato público y están sujetos a las reglas de compatibilidad y deprecación de
   las secciones 13 y 14.

---

## 6. Contrato para estados

1. **Vocabulario cerrado y compartido.** Todo módulo, adaptador o recurso gestionado
   por el sistema se representa siempre con uno de los estados ya definidos en
   FRS-001 §15 y adoptados como vocabulario compartido por el Core: operativo, con
   advertencia, en error, actualizando, pendiente, sin configurar, deshabilitado, o
   incompatible. Ningún módulo puede introducir un estado adicional fuera de este
   catálogo para representar su propia condición general.
2. **Estados específicos de dominio se modelan como detalle, no como estado nuevo.**
   Si un módulo necesita expresar matices propios de su dominio (por ejemplo, "el
   proveedor de IA respondió con latencia elevada"), lo hace mediante el campo de
   detalle asociado al reporte de estado, manteniendo el estado general dentro del
   catálogo cerrado.
3. **El reporte de estado es responsabilidad del propio componente.** Nadie reporta
   el estado de un módulo o adaptador en su nombre; cada componente reporta su
   propio estado a través del mecanismo provisto en su contexto.
4. **El estado reportado durante la inicialización no es visible hasta la
   confirmación del registro.** Mientras un módulo o adaptador se está inicializando,
   su estado no se considera definitivo ante el resto del sistema; solo se hace
   visible una vez completado el registro con éxito, siguiendo la misma disciplina
   de atomicidad ya aplicada por el Core.
5. **El snapshot agregado no es accesible desde `ModuleContext`.** Un módulo solo
   puede reportar su propio estado mediante `ModuleContext.reportStatus()`; no puede
   consultar el estado agregado de otros módulos ni del sistema en general, porque
   `ModuleContext` no incluye ninguna operación de consulta de snapshot. El snapshot
   agregado (`getSnapshot()`) solo está disponible para quien posee la instancia de
   `DWMCore` y usa su API pública — es decir, la capa host y raíz de composición
   (sección 17), nunca un módulo desde dentro de su propio contexto. Un futuro Status
   Manager no puede asumir acceso directo a `getSnapshot()` desde `ModuleContext`: su
   integración con el snapshot agregado deberá resolverse desde la capa host, sin
   modificar el Core.

---

## 7. Contrato para errores

1. **Un único tipo de error para todo el sistema.** Todo módulo, adaptador y
   componente de infraestructura representa sus condiciones de error mediante el
   mismo tipo de error canónico ya establecido por el Core (código perteneciente a
   un catálogo cerrado, mensaje legible, origen, causa opcional encadenada, e
   indicador de si el error es recuperable). Ningún módulo introduce su propio tipo
   de error paralelo.
2. **Catálogo de códigos por módulo, no global único.** Cada módulo mantiene su
   propio catálogo cerrado de códigos de error, con un prefijo que lo identifica de
   forma inequívoca (siguiendo el mismo patrón que el Core aplica a los suyos).
   Ningún módulo reutiliza o reinterpreta un código de error perteneciente al
   catálogo de otro módulo o del propio Core.
3. **Ninguna excepción nativa cruza una frontera de módulo sin envolver.** Toda
   condición de error que se propaga hacia otro módulo, hacia el Core, o hacia un
   evento, debe estar envuelta en el tipo de error canónico antes de cruzar esa
   frontera, preservando la causa original.
4. **El indicador de recuperabilidad es una decisión explícita, no un valor por
   defecto.** Quien lanza un error decide conscientemente si es recuperable
   (el sistema puede continuar en modo degradado) o no (debe detenerse la operación
   en curso), siguiendo el mismo criterio que ya aplica el Core en su propio ciclo
   de vida.
5. **Los errores no se silencian.** Ningún módulo puede capturar una condición de
   error y descartarla sin al menos reportarla como estado (sección 6) o emitirla
   como evento de dominio propio. El único silencio permitido es el ya
   documentado explícitamente por el Core (por ejemplo, un fallo aislado en un
   suscriptor de eventos, que se aísla y se reporta mediante el evento dedicado a
   ese fin).

---

## 8. Contrato para configuración

1. **Formato normalizado único.** Todo módulo que necesite persistir configuración
   propia lo hace en un formato de datos normalizado (estructuras planas
   serializables), nunca en el formato nativo de una herramienta externa concreta;
   esa traducción, si es necesaria, es responsabilidad exclusiva de un adaptador.
2. **Espacio de nombres propio dentro de la configuración.** Cada módulo gestiona su
   propia sección de configuración, identificada de forma que no colisione con la
   de otro módulo ni con la configuración general que ya gestiona el Core.
3. **Lectura de la configuración general a través del contexto.** Un módulo que
   necesita conocer la configuración general del sistema la obtiene únicamente a
   través de la operación de consulta expuesta en su contexto, nunca leyendo
   almacenamiento directamente por su cuenta para ese fin.
4. **La configuración devuelta es inmutable.** Igual que en la API pública del
   Core, cualquier configuración que un módulo exponga hacia otros componentes debe
   entregarse de forma que no permita mutación accidental del estado interno de
   quien la expone.
5. **Ausencia de secretos en la configuración normalizada.** La configuración
   normalizada de cualquier módulo nunca contiene credenciales ni material sensible
   en texto plano; ese contenido pertenece exclusivamente al ámbito de secretos
   (sección 9 y futuro Secrets Manager, fuera del alcance de este documento).
6. **Cambios de configuración son explícitos y versionables.** Todo módulo que
   defina su propio esquema de configuración debe versionarlo de forma explícita,
   siguiendo el mismo principio de compatibilidad de la sección 13.

---

## 9. Contrato para almacenamiento

> Nota: se mantiene el término "almacenamiento" tal como lo usa ADR-001/Core; no se
> introduce un mecanismo nuevo. Esta sección corrige una afirmación incorrecta de la
> versión 1.0.0 de este documento: `ModuleContext` **no** contiene ningún proveedor de
> almacenamiento, e `IModule.init()` **no** recibe dependencias adicionales más allá
> de `ModuleContext`. El Core usa `StorageProvider` internamente, en exclusiva para su
> propia configuración normalizada y perfil activo; no lo redistribuye a los módulos.

1. **`ModuleContext` no incluye acceso a almacenamiento.** Ningún módulo puede asumir
   que recibirá un proveedor de almacenamiento a través de su contexto de
   inicialización. Si un módulo necesita persistir su propio estado, esa necesidad
   se resuelve fuera del Core, según las reglas siguientes.
2. **La dependencia de almacenamiento, si existe, la entrega la capa host antes del
   registro.** Un módulo que necesite almacenamiento propio lo recibe durante su
   construcción — mediante una fábrica o composición externa — a cargo de la capa
   host y raíz de composición (sección 17), **antes** de que ese módulo se registre
   en el Core. El módulo no lo obtiene buscando dentro del Core ni a través de
   `ModuleContext`.
3. **El módulo depende de una abstracción, nunca de un backend concreto ni de una
   ruta física.** La forma de esa dependencia de almacenamiento es una abstracción
   propia del módulo o compartida entre varios módulos por convención explícita
   (documentada por quien la define); en ningún caso el módulo construye rutas de
   sistema de ficheros por su cuenta, asume dónde reside físicamente
   `SISTEMA-DE-TRABAJO`, ni asume un backend concreto (sistema de ficheros, base de
   datos, almacenamiento remoto).
4. **Claves o identificadores con espacio de nombres propio.** Cuando la abstracción
   de almacenamiento de un módulo use claves o identificadores, cada módulo utiliza
   los suyos prefijados de forma que no colisionen con los de otro módulo ni con los
   ya reservados por el Core para su propia configuración y perfiles.
5. **Errores de almacenamiento se envuelven según el contrato de errores.**
   Cualquier fallo de lectura, escritura, existencia o eliminación que un módulo
   gestione en su propia dependencia de almacenamiento se traduce al tipo de error
   canónico (sección 7) antes de propagarse, nunca se deja escapar como excepción
   nativa del backend subyacente.
6. **El almacenamiento no es un canal de comunicación entre módulos.** Un módulo no
   debe leer las claves o identificadores de almacenamiento de otro módulo para
   obtener información de este; la comunicación entre módulos sigue exclusivamente
   las reglas de la sección 2.
7. **Esta sección no modifica `IModule` ni `ModuleContext`.** La resolución de la
   dependencia de almacenamiento es enteramente responsabilidad de la capa host en
   el momento de construir el módulo; no requiere, y no debe interpretarse como que
   requiere, ningún cambio en el contrato congelado del Core.

---

## 10. Contrato para operaciones asíncronas

1. **Toda operación que pueda tardar, fallar de forma externa, o depender de E/S es
   asíncrona.** Esto incluye, como mínimo, inicialización, liberación de recursos,
   registro, baja, lectura y escritura de almacenamiento o configuración, y
   cualquier operación de un adaptador que interactúe con un sistema externo
   (instalar, actualizar, verificar, respaldar, restaurar).
2. **Una operación asíncrona se resuelve o se rechaza; nunca queda indefinida.** Todo
   módulo que expone una operación asíncrona garantiza que, en un tiempo finito,
   dicha operación se resuelve con éxito o se rechaza con un error del tipo canónico
   (sección 7). Ningún contrato de este sistema admite operaciones que permanezcan
   pendientes indefinidamente por diseño.
3. **Las firmas públicas reflejan fielmente la naturaleza asíncrona.** La
   documentación pública de un módulo debe declarar explícitamente qué operaciones
   son asíncronas; ya se estableció como corrección obligatoria sobre el propio
   Core (ADR-002 hereda esa misma exigencia para todo módulo futuro) que ninguna
   documentación puede declarar como síncrona una operación que en realidad no lo
   es, ni viceversa.
4. **Operaciones agregadas (varias sub-operaciones) informan de fallos parciales sin
   detenerse por uno aislado.** Cuando una operación asíncrona coordina varias
   sub-operaciones independientes (por ejemplo, liberar varios recursos), un fallo
   en una de ellas no debe impedir que se intenten las demás; el resultado agregado
   comunica qué falló y qué tuvo éxito, siguiendo el mismo patrón ya aplicado por el
   Core en su apagado ordenado.
5. **No hay operaciones asíncronas ocultas dentro de una operación síncrona
   declarada.** Si una operación necesita realizar trabajo asíncrono, se declara
   como asíncrona; no se permite iniciar trabajo asíncrono "en segundo plano" desde
   dentro de una operación que su contrato público declara síncrona.

---

## 11. Contrato para capacidades (capabilities)

> Nota: esta sección corrige una afirmación incorrecta de la versión 1.0.0 de este
> documento, que sugería que un módulo podía "invocar" capacidades de otro
> directamente. El Core congelado no ofrece ningún mecanismo de invocación entre
> módulos, ni de resolución de dependencias entre componentes, ni acceso desde
> `ModuleContext` al registro de módulos o al registro de adaptadores. Esta sección
> redefine las capacidades exclusivamente como metadatos.

1. **Una capacidad es una unidad declarada de lo que un módulo o adaptador puede
   hacer**, distinta de su identidad y de su estado. Formaliza, para todo módulo
   futuro, el mismo principio que ADR-001 §8.2 ya exige a los adaptadores (detectar,
   instalar, configurar, actualizar, respaldar, restaurar), generalizado a
   cualquier módulo del sistema.
2. **Una capacidad es metadato declarativo, no un mecanismo de invocación.** Un
   módulo o adaptador declara qué capacidades ofrece (por ejemplo, como parte de su
   propia documentación o de una descripción versionada que expone junto a su
   identidad); esa declaración describe *qué puede hacer*, no expone *cómo
   invocarlo* desde otro módulo. Este documento no define, ni presupone, ningún
   mecanismo por el cual un módulo pueda invocar directamente una capacidad de otro
   módulo o adaptador.
3. **Ni el Core ni `ModuleContext` ofrecen descubrimiento, resolución o invocación de
   capacidades.** Un módulo no puede, desde su propio contexto, enumerar los
   módulos o adaptadores registrados, consultar sus capacidades declaradas, ni
   invocarlas. Esa ausencia es intencional y coherente con que `ModuleContext` no
   incluye acceso al registro de módulos ni al registro de adaptadores (sección 0).
4. **El descubrimiento, la resolución y la invocación de capacidades corresponden a
   la capa host y raíz de composición.** Cuando, en el futuro, sea necesario que una
   capacidad de un componente se ponga a disposición de otro, esa coordinación la
   realiza la capa host (sección 17), apoyándose en la API pública ya existente del
   Core (por ejemplo, la consulta de un módulo o adaptador registrado). Este
   documento no define todavía el mecanismo técnico concreto de esa resolución; solo
   fija que dicho mecanismo, cuando exista, vivirá en la capa host y nunca dentro de
   `ModuleContext` ni como comunicación directa entre módulos.
5. **Las capacidades no reemplazan el contrato base.** Identidad, versión, versión
   de contrato, ciclo de vida e integración con eventos/estado/errores (secciones
   3-7) son obligatorias independientemente de qué capacidades adicionales declare
   un componente.
6. **Las capacidades declaradas son parte del contrato público del componente** y,
   por tanto, están sujetas a las mismas reglas de compatibilidad (sección 13) y
   deprecación (sección 14) que cualquier otro elemento de su superficie pública:
   retirar una capacidad de la declaración de un componente sin seguir el proceso de
   deprecación se considera una ruptura de contrato.
7. **La versión de una capacidad es independiente de si esta se usa o no.** Un
   componente puede declarar una capacidad que ningún otro componente consuma
   todavía; su existencia declarativa no depende de que exista ya un mecanismo de
   invocación que la use.

---

## 12. Contrato para versionado

1. **Versionado semántico obligatorio en todo el sistema.** Toda versión (versión
   propia de un módulo, versión de contrato, versión de esquema de configuración,
   versión de un catálogo de eventos de dominio) sigue el formato semántico
   MAYOR.MENOR.PARCHE, con las extensiones estándar de pre-release y metadatos de
   build cuando corresponda. Una versión que no cumpla este formato se rechaza como
   inválida, exactamente igual que ya hace el Core con `version` y
   `contractVersion`.
2. **La versión MAYOR expresa compatibilidad de contrato.** Un cambio de versión
   MAYOR indica que el contrato correspondiente puede haber cambiado de forma
   incompatible; un cambio de versión MENOR o de PARCHE nunca rompe compatibilidad
   con quien ya consume ese contrato.
3. **Cada superficie versionable se versiona de forma independiente.** La versión
   propia de un módulo, la versión de contrato que implementa, y la versión de
   cualquier esquema propio (configuración, catálogo de eventos) son números
   independientes entre sí; incrementar uno no obliga a incrementar los demás.
4. **La versión de contrato es la que se evalúa para decidir compatibilidad
   estructural** (sección 13); la versión propia del módulo es informativa y no se
   usa para decidir si el módulo puede registrarse o comunicarse con el resto del
   sistema.

---

## 13. Compatibilidad entre contratos

1. **Regla general de compatibilidad: misma versión MAYOR de contrato implica
   compatibilidad; versión MAYOR distinta implica incompatibilidad.** Esta es la
   misma regla que el Core ya aplica al registrar módulos y adaptadores, y se
   adopta como regla general para cualquier contrato descrito en este documento
   (eventos de dominio, esquemas de configuración, catálogos de capacidades).
2. **La compatibilidad se evalúa en el punto de integración, no se asume.** Todo
   componente que consume el contrato de otro (por ejemplo, un módulo que escucha
   el catálogo de eventos de otro módulo) debe poder verificar la versión de
   contrato declarada por la contraparte antes de asumir su forma.
3. **Un contrato incompatible se rechaza explícitamente, nunca se adapta de forma
   implícita.** Ningún componente debe intentar "adivinar" o tolerar de forma
   silenciosa una forma de datos que no coincide con la versión de contrato
   esperada; la respuesta ante una incompatibilidad detectada es un rechazo
   explícito con un error del tipo canónico (sección 7).
4. **La compatibilidad hacia atrás dentro de la misma versión MAYOR es
   obligatoria.** Un incremento de versión MENOR o de PARCHE en un contrato no
   puede eliminar ni cambiar el significado de un elemento ya existente; solo puede
   añadir elementos nuevos u opcionales.

---

## 14. Estrategia de deprecación

1. **Ningún elemento de un contrato público se elimina sin pasar por deprecación
   explícita.** Antes de retirar un campo, una capacidad, un tipo de evento de
   dominio o una operación pública, el componente que lo posee debe marcarlo
   expresamente como obsoleto en su propia documentación, indicando desde qué
   versión propia queda marcado así.
2. **Todo elemento marcado como obsoleto sigue funcionando durante el período de
   coexistencia.** Un elemento deprecado no deja de operar en el momento en que se
   marca como tal; sigue disponible y con el mismo comportamiento hasta que se
   retira formalmente en una versión MAYOR posterior de ese contrato.
3. **La retirada de un elemento deprecado exige incremento de versión MAYOR de
   contrato.** Retirar un elemento marcado como obsoleto es, por definición, un
   cambio incompatible (sección 12); no puede realizarse en un incremento de
   versión MENOR o de PARCHE.
4. **La deprecación se comunica de forma activa, no solo documental.** Además de
   quedar reflejada en la documentación del componente, un elemento deprecado
   debería poder comunicarse mediante el mecanismo de estado (sección 6, usando el
   detalle asociado al estado de advertencia) cuando el propio componente detecte
   que otro sigue utilizando el elemento obsoleto.
5. **Un componente no puede deprecar elementos ajenos.** Solo el propietario de un
   contrato (el módulo o adaptador que lo define) puede iniciar el proceso de
   deprecación sobre sus propios elementos; ningún otro módulo puede decidir por él.

---

## 15. Reglas para futuras ampliaciones

1. **Toda ampliación de este documento respeta los principios de la sección 1 sin
   excepción.**
2. **Ninguna ampliación puede reducir una garantía ya otorgada por un contrato
   existente** (por ejemplo, relajar la exigencia de identidad estable, o permitir
   que un módulo reciba una referencia directa a otro módulo); solo puede añadir
   nuevas garantías o nuevos contratos complementarios.
3. **Toda ampliación que introduzca un contrato nuevo (por ejemplo, un contrato
   específico para un tipo de módulo que hoy no existe) se documenta como un ADR
   adicional que referencia explícitamente ADR-002**, siguiendo el mismo criterio de
   gobernanza ya aplicado entre ADR-001 y este documento.
4. **Ninguna ampliación puede exigir un cambio en el Core.** Si una ampliación de
   contrato requiriera que el Core expusiera algo que hoy no expone, esa ampliación
   no puede aprobarse dentro del alcance de "contrato entre módulos": requeriría
   primero una revisión formal del propio Core, tratada como un proceso
   independiente y explícitamente fuera del alcance de este documento.
5. **La numeración de secciones de este documento es estable.** Una ampliación
   futura añade secciones nuevas al final o subsecciones dentro de las existentes;
   no reordena ni renumera las secciones ya aceptadas, para no invalidar referencias
   cruzadas ya hechas desde otros documentos o desde la documentación de módulos.

---

## 16. Ejemplos conceptuales de implementación (sin código)

Los siguientes ejemplos ilustran cómo se aplicarían estos contratos a módulos
futuros, de forma puramente conceptual (ningún fragmento de este apartado es
código ni pseudocódigo):

**Ejemplo A — Un futuro Tooling Manager y sus adaptadores de herramienta.**
El Tooling Manager se registra ante el Core como un módulo que cumple el contrato
base (sección 3): identidad `tooling-manager`, versión propia y versión de contrato
declaradas, inicialización que reporta su propio estado. Durante su operación, no
contiene ninguna lógica específica de "Git" o "VS Code"; en su lugar, documenta qué
capacidades espera de un adaptador de herramienta (por ejemplo, "detectar versión
instalada", "instalar", "actualizar"), como metadato declarativo (sección 11). El
propio Tooling Manager **no** localiza ni obtiene adaptadores por su cuenta, porque su
`ModuleContext` no le da acceso al registro de adaptadores. Es la capa host y raíz de
composición (sección 17) quien, usando la API pública del Core, localiza el adaptador
correspondiente a una herramienta concreta y coordina la interacción entre el Tooling
Manager y ese adaptador para una operación determinada. Si un adaptador de una
herramienta concreta no declara una capacidad determinada, esa ausencia es una
condición consultable por la capa host (sección 11.7), que puede, por ejemplo,
mostrar esa funcionalidad como no disponible para esa herramienta, sin que ello
constituya un error del sistema.

**Ejemplo B — Uso de una credencial gestionada por un futuro Secrets Manager desde un
futuro AI Manager, sin comunicación directa entre ambos.**
El AI Manager necesita una credencial gestionada por el Secrets Manager para probar
la conexión con un proveedor de IA concreto. Ni el AI Manager emite un evento
solicitando la credencial, ni el Secrets Manager la publica como respuesta: los
eventos de dominio, según la sección 5, solo comunican hechos ya ocurridos, nunca
solicitudes ni respuestas, y ningún secreto viaja jamás como payload de un evento. En
su lugar, la capa host y raíz de composición (sección 17) —que es quien construyó y
registró ambos módulos, y quien tiene acceso a la API pública completa del Core— es
la que obtiene de forma controlada el valor mínimo necesario a través del propio
Secrets Manager, y se lo entrega directamente al AI Manager únicamente para el ámbito
de la operación concreta que lo requiere (por ejemplo, como parámetro de esa
operación puntual, no como estado retenido). El AI Manager y el Secrets Manager no se
importan, no se referencian y no se invocan directamente entre sí en ningún momento:
ambos son, el uno para el otro, componentes opacos coordinados exclusivamente por la
capa host. El mecanismo técnico exacto mediante el cual la capa host obtiene y
entrega ese valor no se define en este documento (sección 17).

**Ejemplo C — Deprecación de una capacidad de un adaptador de sistema operativo.**
Un adaptador de sistema operativo para Windows declara inicialmente una capacidad de
"instalación silenciosa" en su versión propia 1.2.0. En una versión posterior 1.5.0,
el mantenedor del adaptador decide sustituirla por una capacidad más general de
"instalación con perfil de interacción configurable". La capacidad antigua se marca
como obsoleta en 1.5.0 pero sigue funcionando exactamente igual; solo en una versión
MAYOR posterior de la versión de contrato del adaptador (por ejemplo, al pasar de
contrato 1.x a 2.x) se retira definitivamente, comunicándose el cambio como una
incompatibilidad de versión MAYOR (secciones 13 y 14).

**Ejemplo D — Un futuro Log Manager suscrito a errores de todo el sistema.**
El Log Manager no recibe los errores de otros módulos por inyección directa; se
suscribe al evento `core:error` (lectura permitida sobre el namespace reservado,
sección 5.3) y, adicionalmente, cualquier módulo que documente su propio evento de
dominio para errores no recuperables de su ámbito puede ser escuchado por el Log
Manager si este decide suscribirse también a esos namespaces de dominio. El Log
Manager nunca decide por otro módulo si un error es recuperable: esa decisión ya
viene fijada en el propio error, en origen (sección 7.4).

---

## 17. Capa Host y raíz de composición

> Esta sección se introduce en la versión 1.0.1 de este documento para formalizar,
> a nivel arquitectónico, la capa que resuelve todo lo que los módulos y adaptadores,
> por contrato, no pueden resolver por sí mismos (localización de otros componentes,
> acceso al snapshot agregado, dependencias externas como almacenamiento propio, y
> coordinación de casos de uso que requieren más de un módulo). Esta sección no
> define su implementación técnica, que se reserva para un documento posterior.

1. **Existe una capa externa al Core y a los módulos.** Esta capa —la capa host y
   raíz de composición— es el único componente del sistema con visibilidad
   simultánea sobre el Core, sobre todos los módulos y sobre todos los adaptadores.
   Ningún módulo ni adaptador tiene esa visibilidad; solo la capa host la tiene.
2. **La capa host crea la instancia de `DWMCore`** y es responsable de invocar su
   ciclo de vida público (`initialize`, `markRunning`, `shutdown`) según lo descrito
   en el Core.
3. **La capa host construye los módulos y adaptadores**, incluyendo la resolución de
   cualquier dependencia externa que estos necesiten y que `ModuleContext` no
   provee (por ejemplo, un proveedor de almacenamiento propio de un módulo, sección
   9), mediante fábricas o composición explícita, **antes** de registrarlos.
4. **La capa host registra los componentes mediante la API pública del Core**
   (`registerModule`, `registerAdapter`), y es también quien puede darlos de baja
   (`unregisterModule`, `unregisterAdapter`) cuando corresponda.
5. **La capa host es la única que puede consultar `getSnapshot()`, los registros
   (`listModules`, `listAdapters`, `getModule`, `getAdapter`, `getAdapterFor`) y el
   resto de la API pública del Core.** Ningún módulo tiene ese acceso desde su
   propio contexto (secciones 6 y 11).
6. **La capa host coordina los casos de uso que requieren más de un módulo.** Cuando
   una operación del sistema necesita la colaboración de dos o más componentes (por
   ejemplo, obtener una credencial de un módulo para usarla en una operación de
   otro), es la capa host quien orquesta esa colaboración, apoyándose en las
   referencias a los componentes que ella misma construyó o en la API pública del
   Core; los componentes nunca se comunican directamente entre sí para ese fin
   (sección 2).
7. **La capa host no contiene lógica específica de herramientas o sistemas
   operativos.** Esa lógica, cuando exista, reside exclusivamente en los adaptadores
   correspondientes (sección 4); la capa host solo orquesta, no reimplementa
   lógica de dominio de las herramientas o plataformas.
8. **La capa host no modifica el Core.** Toda su capacidad de actuación proviene del
   uso de la API pública ya congelada de `@dwm/core`, nunca de una ampliación de
   dicha superficie.
9. **La capa host no permite que los módulos se importen o se referencien
   directamente entre sí.** Su función de coordinación no es una excepción a la
   regla de comunicación de la sección 2: los módulos siguen sin conocerse entre sí;
   es la capa host quien conoce a los módulos, nunca al revés.
10. **La capa host no es todavía una interfaz gráfica ni un módulo funcional.** Es
    una capa de composición y orquestación, arquitectónicamente distinta tanto de un
    módulo (sección 3) como de una futura aplicación o panel de usuario (FRS-001).
    No cumple el contrato base de módulo descrito en este documento porque no se
    registra a sí misma ante el Core: es quien realiza el registro de los demás.
11. **Su implementación se define en un documento técnico posterior.** Este
    documento fija su existencia, sus responsabilidades y sus límites a nivel
    arquitectónico; no define su tecnología, su estructura interna, ni el mecanismo
    concreto mediante el cual resuelve la coordinación descrita en el punto 6.

---

## 18. Glosario

- **Contrato interno:** forma estable que debe respetar un componente para
  integrarse en el sistema, independiente de su implementación.
- **Módulo:** componente funcional del sistema (ver ADR-001 §6) que cumple el
  contrato base de la sección 3.
- **Adaptador:** componente que traduce operaciones genéricas a la implementación
  específica de una herramienta o sistema operativo, cumpliendo la sección 4.
- **Namespace de evento:** prefijo que identifica de forma inequívoca el origen de
  un evento (`core:*` para el Core; `<dominio>:*` para cada módulo).
- **Capacidad (capability):** unidad declarada, en forma de metadato, de lo que un
  módulo o adaptador puede hacer; no implica un mecanismo de invocación directa entre
  módulos (sección 11).
- **Versión de contrato:** versión semántica que indica qué forma de un contrato
  implementa un componente, evaluada para decidir compatibilidad (secciones 12-13).
- **Deprecación:** proceso formal de marcar un elemento de un contrato como
  destinado a su retirada, manteniéndolo funcional durante un período de
  coexistencia (sección 14).
- **Capa host y raíz de composición:** capa externa al Core y a los módulos, con
  visibilidad simultánea sobre ambos, responsable de construir, proveer
  dependencias externas, registrar y coordinar módulos y adaptadores usando
  exclusivamente la API pública del Core (sección 17).

---

## 19. Control de versiones del documento

| Versión | Fecha | Descripción | Estado |
|---|---|---|---|
| 1.0.0 | 2026-07-28 | Versión inicial. Constituye ADR-002 y contrato interno obligatorio para todos los módulos del proyecto DWM a partir de esta fase. | Aceptado |
| 1.0.1 | 2026-07-28 | Corrección de coherencia con el Core congelado: (1) las capacidades quedan redefinidas como metadatos declarativos, sin mecanismo de invocación entre módulos ni acceso al registro de módulos/adaptadores desde `ModuleContext`; (2) se elimina el uso de eventos como patrón de solicitud-respuesta y se prohíbe expresamente que un secreto viaje como payload de un evento; (3) se aclara que el snapshot agregado (`getSnapshot()`) no es accesible desde `ModuleContext` y solo está disponible para quien posee la instancia de `DWMCore`; (4) se aclara que `ModuleContext` no expone ningún proveedor de almacenamiento y que dicha dependencia, si un módulo la necesita, la entrega la capa host antes del registro; (5) se formaliza una nueva sección 17, "Capa Host y raíz de composición", como la capa arquitectónica que resuelve todo lo anterior sin modificar el Core. No se declara ningún cambio de arquitectura del Core. | Aceptado |

**Nota de gobernanza:** cualquier modificación futura de este documento debe
realizarse mediante un nuevo ADR que referencie explícitamente ADR-002, indicando qué
sección modifica y por qué. ADR-002 no se edita retroactivamente salvo corrección de
erratas que no alteren su contenido decisional. ADR-002 no modifica, y no puede
modificar, el contenido de ADR-001 ni de FRS-001.

---

*Fin del documento — ADR-002 — Dev Workspace Manager (DWM)*
