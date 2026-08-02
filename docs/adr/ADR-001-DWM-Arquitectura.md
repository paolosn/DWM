# ADR-001 — Arquitectura Oficial del Proyecto

**Proyecto:** Dev Workspace Manager
**Abreviatura:** DWM
**Tipo de documento:** Architecture Decision Record (ADR) fundacional
**Estado:** Aceptado — Documento de referencia definitivo
**Versión:** 1.0.0
**Fecha:** 2026-07-27
**Alcance:** Windows, macOS, Linux

---

## Índice

1. Objetivos
2. Principios de diseño
3. Filosofía del proyecto
4. Arquitectura general
5. División por módulos
6. Responsabilidad de cada módulo
7. Flujo de comunicación
8. Arquitectura mediante adaptadores
9. Gestión de configuración
10. Gestión de secretos
11. Gestión de perfiles
12. Gestión de plugins
13. Gestión de logs
14. Gestión de backups
15. Gestión de restauración
16. Gestión de migraciones
17. Reglas de escalabilidad
18. Reglas para futuras ampliaciones
19. Reglas de compatibilidad entre versiones
20. Decisiones arquitectónicas importantes (justificación)
21. Glosario
22. Control de versiones del documento

---

## 1. Objetivos

### 1.1 Objetivo general

Construir un sistema, **Dev Workspace Manager (DWM)**, capaz de reconstruir de forma automática y determinista un entorno de desarrollo completo en Windows, macOS y Linux, a partir de una única carpeta de trabajo gestionada por el propio sistema: `SISTEMA-DE-TRABAJO`.

### 1.2 Objetivos específicos

1. Eliminar la configuración manual de entornos de desarrollo.
2. Eliminar la edición manual de archivos de configuración (JSON, YAML, INI, etc.).
3. Eliminar la búsqueda manual de rutas de instalación, binarios o directorios de datos.
4. Eliminar la copia manual de configuraciones entre distintos equipos.
5. Centralizar en un único punto de entrada (DWM) toda operación relativa al entorno de desarrollo: detección, instalación, configuración, backup, restauración y migración.
6. Garantizar que el conocimiento de "dónde y cómo" cada herramienta guarda su información resida exclusivamente en el sistema, no en la memoria del usuario.
7. Permitir que el usuario recupere un entorno de trabajo funcional en un equipo nuevo o reinstalado en el menor número de pasos posible.

### 1.3 Fuera de alcance (en esta fase)

- Implementación de código, scripts o prototipos.
- Selección de lenguaje de programación del núcleo.
- Definición de interfaz de usuario (CLI, GUI, TUI).
- Infraestructura de distribución (instaladores, empaquetado).

Estos puntos se definirán en documentos posteriores (ADR-002 en adelante), y deberán respetar en todo momento lo establecido en este documento.

---

## 2. Principios de diseño

Los siguientes principios son de obligado cumplimiento en cualquier decisión de diseño o implementación futura:

| # | Principio | Descripción |
|---|---|---|
| P1 | **Modularidad** | El sistema se compone de módulos independientes con responsabilidades únicas y bien delimitadas. |
| P2 | **Escalabilidad** | El sistema debe soportar el crecimiento en número de herramientas, perfiles, proyectos y sistemas operativos sin rediseño del núcleo. |
| P3 | **Portabilidad** | El comportamiento funcional debe ser equivalente en Windows, macOS y Linux. |
| P4 | **Independencia del sistema operativo** | El núcleo no contiene lógica específica de un SO; toda diferencia se resuelve en capas de abstracción. |
| P5 | **Independencia de herramientas** | El núcleo no conoce herramientas concretas (Kilo Code, Cursor, Cline, Continue, Roo, GitLens, Copilot, etc.); solo conoce contratos/interfaces. |
| P6 | **Mantenibilidad** | Cualquier cambio en una herramienta externa debe afectar únicamente al adaptador correspondiente. |
| P7 | **Extensibilidad** | Añadir soporte para una nueva herramienta, SO o funcionalidad no debe requerir modificar el núcleo, solo añadir un componente nuevo. |
| P8 | **Determinismo** | Ante el mismo estado de entrada, DWM debe producir el mismo resultado, sea cual sea el equipo o el momento de ejecución. |
| P9 | **Transparencia** | Toda acción relevante del sistema debe quedar registrada y ser auditable. |
| P10 | **Reversibilidad** | Toda operación que modifique el entorno debe poder revertirse mediante backup/restauración. |
| P11 | **Longevidad** | El diseño debe anticipar una vida útil de varios años, priorizando estabilidad de contratos internos sobre optimizaciones puntuales. |

---

## 3. Filosofía del proyecto

DWM parte de una premisa central: **el usuario no debe gestionar el entorno; el usuario gestiona el trabajo, DWM gestiona el entorno.**

Esto se traduce en tres compromisos permanentes:

1. **Cero configuración manual repetida.** Ninguna acción que DWM pueda automatizar debe quedar como tarea manual recurrente para el usuario.
2. **Una sola fuente de verdad.** Toda la información necesaria para reconstruir un entorno reside dentro de `SISTEMA-DE-TRABAJO`, nunca dispersa en la memoria del usuario o en configuraciones ad-hoc de cada máquina.
3. **Desacoplamiento total de herramientas concretas.** DWM no se casa con ninguna herramienta de IA, editor o utilidad. Las herramientas son reemplazables; el núcleo, no.

La filosofía se resume en la relación:

```
DWM → Adaptador → Herramienta
```

Si una herramienta cambia (API, formato de configuración, ubicación de archivos), se modifica exclusivamente su adaptador. El núcleo de DWM permanece intacto. Esta es la garantía de longevidad del proyecto.

---

## 4. Arquitectura general

### 4.1 Visión de alto nivel

DWM se organiza en cuatro capas conceptuales:

1. **Capa de Núcleo (Core Layer)** — lógica de negocio independiente de SO y de herramientas.
2. **Capa de Abstracción de Sistema Operativo (OS Abstraction Layer)** — normaliza diferencias entre Windows, macOS y Linux.
3. **Capa de Adaptadores (Adapter Layer)** — traduce las operaciones genéricas del núcleo a las particularidades de cada herramienta externa.
4. **Capa de Almacenamiento y Estado (State & Storage Layer)** — persiste configuración, perfiles, secretos, logs y backups dentro de `SISTEMA-DE-TRABAJO`.

### 4.2 Carpeta única de usuario

El usuario interactúa exclusivamente con:

```
SISTEMA-DE-TRABAJO/
```

Esta carpeta es la raíz lógica de todo el sistema. Todo lo demás (caché interna, estado de ejecución, artefactos temporales) es responsabilidad exclusiva de DWM y no requiere intervención del usuario.

### 4.3 Estructura conceptual de `SISTEMA-DE-TRABAJO`

A nivel conceptual (sin detallar implementación), la carpeta contiene las siguientes áreas funcionales, cada una gestionada por su módulo correspondiente:

- Área de configuración
- Área de secretos (cifrada)
- Área de perfiles
- Área de proyectos
- Área de plugins/adaptadores
- Área de logs
- Área de backups
- Área de estado interno del sistema

La estructura física exacta se define en un documento de implementación posterior (ADR-002), pero su existencia conceptual queda fijada aquí como contrato estable.

### 4.4 Principio de entrada única

Toda operación del usuario pasa por un único punto de entrada lógico (el "orquestador" de DWM). El usuario nunca invoca módulos internos directamente; siempre a través de este punto de entrada, que decide qué módulos activar y en qué orden.

---

## 5. División por módulos

DWM se organiza en los siguientes módulos, todos ellos ciudadanos de igual jerarquía respecto al orquestador:

1. **Módulo de Orquestación (Orchestrator)**
2. **Módulo de Detección de Entorno (Environment Scanner)**
3. **Módulo de Gestión de Herramientas (Tooling Manager)**
4. **Módulo de Adaptadores (Adapter Registry)**
5. **Módulo de Gestión de IA (AI Manager)**
6. **Módulo de Gestión de Secretos (Secrets Manager)**
7. **Módulo de Gestión de Configuración (Configuration Manager)**
8. **Módulo de Gestión de Perfiles (Profile Manager)**
9. **Módulo de Gestión de Proyectos (Project Manager)**
10. **Módulo de Gestión de Plugins (Plugin Manager)**
11. **Módulo de Backup (Backup Manager)**
12. **Módulo de Restauración (Restore Manager)**
13. **Módulo de Migración (Migration Manager)**
14. **Módulo de Verificación (Verification Manager)**
15. **Módulo de Logging (Log Manager)**
16. **Módulo de Estado y Reporting (Status Manager)**

---

## 6. Responsabilidad de cada módulo

### 6.1 Orquestador
Punto de entrada único. Recibe la intención del usuario, resuelve qué módulos deben intervenir, define el orden de ejecución y garantiza la coherencia transaccional del proceso (todo-o-nada cuando aplique).

### 6.2 Environment Scanner
Detecta sistema operativo, arquitectura de hardware relevante, herramientas instaladas, versiones, rutas y dependencias presentes en el equipo. Produce un "informe de estado del entorno" que consumen el resto de módulos. No modifica nada; solo observa.

### 6.3 Tooling Manager
Responsable de instalar, actualizar y configurar herramientas de desarrollo, delegando siempre la parte específica de cada herramienta al Adapter Registry. Decide **qué** hacer; el adaptador decide **cómo** hacerlo.

### 6.4 Adapter Registry
Catálogo de adaptadores disponibles. Cada adaptador implementa un contrato común (interfaz) para una herramienta concreta. Es el único punto del sistema que "conoce" el nombre y las particularidades de una herramienta externa.

### 6.5 AI Manager
Gestiona qué proveedores/modelos de IA están configurados, su asociación a perfiles y proyectos, y coordina con Secrets Manager el acceso a credenciales. No implementa integraciones directas; usa adaptadores de IA.

### 6.6 Secrets Manager
Gestión centralizada y cifrada de API keys y credenciales. Ningún otro módulo almacena secretos por su cuenta; todos los solicitan a este módulo mediante un contrato de acceso controlado.

### 6.7 Configuration Manager
Gestiona la configuración funcional del propio DWM y la configuración normalizada de las herramientas gestionadas, exponiéndola en un formato interno único e independiente del formato nativo de cada herramienta.

### 6.8 Profile Manager
Gestiona perfiles de usuario/trabajo (por ejemplo, distintos contextos de uso, distintas identidades de desarrollo, distintas combinaciones de herramientas/IA). Un perfil es un conjunto coherente de configuración, herramientas e IA asociada.

### 6.9 Project Manager
Gestiona el ciclo de vida de los proyectos de desarrollo dentro del sistema: alta, asociación a perfil, requisitos de entorno específicos por proyecto.

### 6.10 Plugin Manager
Gestiona la instalación, versión, activación/desactivación y ciclo de vida de los adaptadores y extensiones de terceros del propio DWM (no confundir con plugins de las herramientas externas).

### 6.11 Backup Manager
Genera copias de seguridad íntegras y versionadas del estado gestionado por DWM (configuración, perfiles, secretos cifrados, metadatos de proyectos).

### 6.12 Restore Manager
Reconstruye un entorno completo a partir de un backup válido, coordinando al Tooling Manager y a los adaptadores para reinstalar y reconfigurar todo lo necesario.

### 6.13 Migration Manager
Gestiona el traslado de un entorno de un equipo/SO a otro, incluyendo la transformación de configuración cuando el sistema operativo de destino difiere del de origen.

### 6.14 Verification Manager
Verifica, tras cualquier instalación, restauración o migración, que el entorno resultante cumple el estado esperado (checks de integridad, versión, disponibilidad).

### 6.15 Log Manager
Registro centralizado, estructurado y consultable de toda acción relevante ejecutada por cualquier módulo.

### 6.16 Status Manager
Agrega información de todos los módulos para producir una vista de estado general del sistema y del entorno.

---

## 7. Flujo de comunicación

### 7.1 Regla general

Ningún módulo se comunica directamente con otro sin pasar por el Orquestador, salvo las dependencias de infraestructura transversal explícitamente permitidas: **Log Manager** y **Secrets Manager**, a los que cualquier módulo puede invocar directamente por su naturaleza de servicio transversal.

### 7.2 Flujo tipo (ejemplo conceptual, sin código)

Para una operación como "reconstruir entorno en equipo nuevo":

1. El usuario invoca al Orquestador.
2. El Orquestador solicita al Environment Scanner el estado actual del equipo.
3. El Orquestador solicita al Restore Manager el backup de referencia.
4. El Restore Manager coordina con Configuration Manager, Profile Manager y Secrets Manager para reconstruir configuración, perfiles y credenciales.
5. El Restore Manager delega en Tooling Manager la instalación de herramientas, que a su vez delega en los adaptadores correspondientes vía Adapter Registry.
6. El Verification Manager valida el resultado.
7. El Log Manager registra cada paso anterior.
8. El Status Manager expone el resultado final al usuario.

### 7.3 Principio de contrato estable

La comunicación entre módulos se realiza siempre mediante contratos de interfaz estables y versionados, nunca mediante acoplamiento directo a la implementación interna de otro módulo.

---

## 8. Arquitectura mediante adaptadores

### 8.1 Justificación

El ecosistema de herramientas de desarrollo (editores, asistentes de IA, extensiones) cambia con alta frecuencia. Acoplar el núcleo a herramientas concretas comprometería la longevidad del proyecto (principio P11).

### 8.2 Contrato del adaptador

Todo adaptador debe:

1. Implementar un conjunto fijo de capacidades exigidas por el núcleo (detectar, instalar, configurar, actualizar, hacer backup y restaurar el elemento que gestiona).
2. No exponer ninguna capacidad adicional al núcleo que no forme parte del contrato común.
3. Ser reemplazable sin ningún impacto fuera de sí mismo.
4. Declarar explícitamente su versión de contrato soportada (ver sección 19).

### 8.3 Relación núcleo–adaptador–herramienta

```
DWM (Núcleo)
   ↓ contrato estable
Adaptador (por herramienta)
   ↓ integración específica
Herramienta externa (Kilo Code, Cursor, Cline, Continue, Roo, GitLens, Copilot, etc.)
```

El núcleo nunca importa, referencia ni asume comportamiento de una herramienta concreta. Toda herramienta nueva se incorpora mediante un nuevo adaptador, sin tocar el núcleo.

### 8.4 Adaptadores de sistema operativo

De forma análoga a los adaptadores de herramienta, existen adaptadores de sistema operativo, responsables de traducir operaciones genéricas (instalar, localizar ruta, gestionar variables de entorno, gestionar permisos) a la implementación específica de Windows, macOS o Linux.

---

## 9. Gestión de configuración

1. Toda configuración gestionada por DWM se almacena en un formato interno normalizado, independiente del formato nativo que use cada herramienta externa.
2. La traducción entre el formato interno y el formato nativo de cada herramienta es responsabilidad exclusiva del adaptador correspondiente.
3. El usuario nunca edita configuración nativa de una herramienta a mano; toda modificación se realiza a través de DWM.
4. La configuración se versiona internamente, permitiendo saber en todo momento qué versión de configuración generó qué estado del entorno.
5. La configuración es exportable e importable como parte de los procesos de backup, restauración y migración.

---

## 10. Gestión de secretos

1. Toda API key o credencial se gestiona exclusivamente a través del Secrets Manager.
2. Los secretos se almacenan cifrados en reposo dentro del área correspondiente de `SISTEMA-DE-TRABAJO`.
3. Ningún módulo, adaptador o log debe almacenar ni exponer un secreto en texto plano bajo ninguna circunstancia.
4. El acceso a un secreto por parte de un módulo o adaptador se realiza bajo un modelo de solicitud explícita y con propósito declarado, nunca por acceso directo a almacenamiento.
5. La rotación, revocación o sustitución de un secreto no debe requerir reconfiguración manual de las herramientas que lo consumen; DWM propaga el cambio a través del Configuration Manager y los adaptadores afectados.
6. Los secretos quedan excluidos de cualquier exportación en texto plano; en procesos de backup, migración o diagnóstico se tratan siempre como material cifrado.

---

## 11. Gestión de perfiles

1. Un perfil representa un conjunto coherente de configuración, herramientas activas, IA asociada y preferencias de trabajo.
2. Un usuario puede tener múltiples perfiles simultáneos (por ejemplo, distintos contextos de trabajo o distintas combinaciones de herramientas).
3. Un perfil es portable: debe poder migrarse a otro equipo u otro sistema operativo sin pérdida de coherencia funcional.
4. Los proyectos se asocian a uno o varios perfiles, nunca a configuración suelta fuera del sistema de perfiles.
5. El cambio de perfil activo no debe requerir reconfiguración manual de herramientas; DWM reconcilia el entorno automáticamente.

---

## 12. Gestión de plugins

1. Se distingue entre **plugins de DWM** (extensiones del propio sistema, incluidos los adaptadores) y **complementos de herramientas externas** (que son responsabilidad del adaptador correspondiente, no del núcleo).
2. Todo plugin de DWM se registra en el Adapter Registry / Plugin Manager con metadatos obligatorios: identificador único, versión, contrato de interfaz soportado y compatibilidad de sistema operativo.
3. Los plugins se activan o desactivan de forma independiente, sin afectar al resto del sistema.
4. Un plugin nunca puede modificar el núcleo ni el comportamiento de otro plugin; su alcance queda limitado a su propio dominio (una herramienta, un servicio, una integración concreta).
5. La instalación de un plugin nuevo no debe requerir una nueva versión del núcleo, salvo que se introduzca un cambio de contrato (ver sección 19).

---

## 13. Gestión de logs

1. Todo módulo que ejecute una acción relevante (instalación, cambio de configuración, backup, restauración, migración, error) debe registrar dicha acción a través del Log Manager.
2. Los logs se estructuran de forma consistente, permitiendo filtrar por módulo, por proyecto, por perfil, por sistema operativo y por fecha.
3. Los logs no contienen secretos ni información sensible en texto plano.
4. Los logs son la fuente principal de auditoría para diagnosticar por qué un entorno quedó en un estado determinado.
5. Existe una política de retención y rotación de logs, evitando crecimiento ilimitado del área de logs dentro de `SISTEMA-DE-TRABAJO`.

---

## 14. Gestión de backups

1. Un backup es una instantánea íntegra y versionada del estado gestionado por DWM: configuración, perfiles, metadatos de proyectos y secretos cifrados.
2. Los backups se generan de forma explícita (a petición del usuario) y, opcionalmente, de forma programada.
3. Cada backup queda identificado con: fecha, versión de DWM que lo generó, sistema operativo de origen y checksum de integridad.
4. Los backups son independientes del sistema operativo de origen a nivel de contenido (la información se almacena en formato interno normalizado); la aplicación a un SO concreto es responsabilidad de los adaptadores en el momento de restaurar.
5. Debe conservarse un histórico razonable de backups, no solo el último, para permitir rollback a puntos anteriores.

---

## 15. Gestión de restauración

1. Restaurar significa reconstruir un entorno completo a partir de un backup válido, en el mismo equipo o en uno distinto.
2. El proceso de restauración es coordinado por el Restore Manager y se apoya en Tooling Manager, adaptadores y Verification Manager.
3. La restauración debe ser idempotente: ejecutarla varias veces sobre el mismo estado no debe producir resultados inconsistentes.
4. Toda restauración finaliza con una verificación automática de integridad (sección 6.14) antes de considerarse completada.
5. Si una restauración falla parcialmente, el sistema debe informar con precisión qué componentes se restauraron correctamente y cuáles no, sin dejar al usuario adivinando el estado real del entorno.

---

## 16. Gestión de migraciones

1. Migrar significa trasladar un entorno de un equipo o sistema operativo a otro distinto del de origen.
2. La migración reutiliza el mecanismo de backup/restauración, añadiendo una etapa de traducción cuando el sistema operativo de destino difiere del de origen.
3. Esta traducción es responsabilidad de los adaptadores de sistema operativo (sección 8.4); el núcleo y los datos migrados en formato interno normalizado no cambian.
4. Toda migración concluye con verificación de integridad, igual que la restauración.
5. Una migración fallida no debe dejar el equipo de destino en un estado intermedio no documentado; debe quedar registrada en logs y reportada en el Status Manager con el detalle suficiente para intervención manual si fuera necesario.

---

## 17. Reglas de escalabilidad

1. Añadir una nueva herramienta soportada implica únicamente crear un nuevo adaptador; no debe requerir cambios en el núcleo.
2. Añadir un nuevo sistema operativo soportado implica crear un nuevo adaptador de sistema operativo; no debe requerir cambios en la lógica de negocio del núcleo.
3. Añadir un nuevo tipo de perfil o de proyecto no debe requerir cambios estructurales en el Profile Manager o Project Manager, sino uso de los mecanismos de extensión ya previstos por dichos módulos.
4. El crecimiento en volumen de datos (más proyectos, más perfiles, más backups históricos) no debe degradar la capacidad de DWM de producir un informe de estado (Status Manager) en un tiempo razonable; esto se garantiza mediante indexación y resúmenes incrementales, a definir en el documento de implementación.
5. Ningún módulo debe imponer límites arbitrarios de escala (número de perfiles, proyectos o adaptadores) salvo restricciones técnicas justificadas y documentadas.

---

## 18. Reglas para futuras ampliaciones

1. Toda ampliación del sistema debe respetar los principios de diseño de la sección 2 sin excepción.
2. Ninguna ampliación puede introducir dependencia directa del núcleo hacia una herramienta o servicio externo concreto; debe canalizarse mediante un adaptador nuevo o existente.
3. Toda ampliación que implique una nueva capacidad transversal (por ejemplo, un nuevo tipo de recurso a versionar además de configuración/perfiles/secretos) debe evaluarse primero como posible módulo nuevo antes que como extensión de uno existente, preservando la responsabilidad única de cada módulo (sección 6).
4. Las funcionalidades de "Fase 2" o posteriores (no contempladas en el alcance inicial) deben documentarse como ADRs adicionales que referencien y respeten este documento como base, nunca que lo sustituyan sin un proceso formal de revisión (sección 22).
5. Cualquier propuesta de ampliación que requiera romper un contrato de interfaz estable debe tratarse conforme a las reglas de compatibilidad de la sección 19, incluyendo período de transición y deprecación explícita.

---

## 19. Reglas de compatibilidad entre versiones

1. Todo contrato de interfaz (entre núcleo y adaptadores, entre módulos, y de formato de backup) se versiona de forma explícita (versionado semántico: MAYOR.MENOR.PARCHE).
2. Un cambio de versión **MENOR** o **PARCHE** nunca rompe compatibilidad con adaptadores o backups existentes.
3. Un cambio de versión **MAYOR** puede romper compatibilidad, pero exige:
   - Documentación explícita del cambio y su motivo.
   - Mecanismo de migración del estado existente a la nueva versión de contrato.
   - Un período de coexistencia o aviso de deprecación antes de retirar el soporte a la versión anterior, siempre que sea técnicamente viable.
4. Ningún adaptador puede asumir implícitamente una versión de contrato del núcleo; debe declararla y el núcleo debe poder verificar la compatibilidad antes de invocarlo.
5. Los backups almacenan la versión de contrato con la que fueron generados, de forma que el Restore Manager pueda aplicar la lógica de compatibilidad o migración de formato correspondiente.

---

## 20. Decisiones arquitectónicas importantes (justificación)

| Decisión | Justificación |
|---|---|
| **D1. Arquitectura por adaptadores obligatoria para toda herramienta externa** | Es la única forma de garantizar que el núcleo sobreviva a los cambios inevitables del ecosistema de herramientas de IA y desarrollo (principios P5, P6, P11). |
| **D2. Punto de entrada único (Orquestador)** | Evita comunicación caótica entre módulos y permite garantizar transaccionalidad y trazabilidad completa (principio P9). |
| **D3. Carpeta única de usuario (`SISTEMA-DE-TRABAJO`)** | Cumple el objetivo central del proyecto: el usuario no debe conocer ni gestionar la estructura interna del sistema. |
| **D4. Secretos gestionados por un módulo único y cifrado en reposo** | Minimiza superficie de riesgo y evita que credenciales queden dispersas en configuraciones nativas de cada herramienta. |
| **D5. Configuración normalizada e independiente del formato nativo** | Permite portabilidad real entre sistemas operativos y desacopla al usuario de formatos propietarios de cada herramienta. |
| **D6. Backup y restauración basados en formato interno, no en copia literal de archivos nativos** | Garantiza que un backup generado en un SO pueda restaurarse en otro distinto, cumpliendo el objetivo de portabilidad total. |
| **D7. Versionado explícito de todo contrato de interfaz** | Es la base que permite evolucionar el sistema durante años sin romper compatibilidad de forma silenciosa (principio P11). |
| **D8. Separación entre "plugins de DWM" y "complementos de herramientas externas"** | Evita ambigüedad de responsabilidad y mantiene la regla de que el núcleo nunca gestiona directamente el complemento de una herramienta externa; siempre lo hace vía adaptador. |
| **D9. Verificación automática tras instalar, restaurar o migrar** | Ninguna operación se considera completa sin confirmación objetiva de que el entorno resultante es el esperado; evita estados "silenciosamente rotos". |
| **D10. Esta fase produce únicamente arquitectura, sin código** | Fija un contrato de diseño estable antes de cualquier implementación, evitando decisiones de código que condicionen prematuramente la arquitectura. |

---

## 21. Glosario

- **DWM:** Dev Workspace Manager, el sistema objeto de este documento.
- **SISTEMA-DE-TRABAJO:** Carpeta única visible para el usuario; raíz lógica de todo el sistema.
- **Núcleo (Core):** Lógica de negocio de DWM, independiente de sistema operativo y de herramientas concretas.
- **Adaptador:** Componente que traduce operaciones genéricas del núcleo a la implementación específica de una herramienta o sistema operativo concreto.
- **Perfil:** Conjunto coherente de configuración, herramientas e IA asociada a un contexto de trabajo.
- **Proyecto:** Unidad de trabajo de desarrollo gestionada por DWM, asociada a uno o varios perfiles.
- **Contrato de interfaz:** Definición estable y versionada de qué capacidades debe exponer un módulo o adaptador, sin especificar su implementación interna.
- **Backup:** Instantánea íntegra y versionada del estado gestionado por DWM.
- **Restauración:** Reconstrucción de un entorno completo a partir de un backup.
- **Migración:** Traslado de un entorno de un equipo/SO de origen a otro de destino.

---

## 22. Control de versiones del documento

| Versión | Fecha | Descripción | Estado |
|---|---|---|---|
| 1.0.0 | 2026-07-27 | Versión inicial del documento de arquitectura. Constituye ADR-001 y referencia definitiva del proyecto DWM. | Aceptado |

**Nota de gobernanza:** cualquier modificación futura de este documento debe realizarse mediante un nuevo ADR que referencie explícitamente ADR-001, indicando qué sección modifica y por qué. ADR-001 no se edita retroactivamente salvo corrección de erratas que no alteren su contenido decisional.

---

*Fin del documento — ADR-001 — Dev Workspace Manager (DWM)*
