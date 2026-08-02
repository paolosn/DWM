# FRS-001 — Especificación Funcional Oficial

**Proyecto:** Dev Workspace Manager
**Abreviatura:** DWM
**Tipo de documento:** Functional Requirements Specification (FRS) fundacional
**Documento de referencia previo:** ADR-001 — Arquitectura Oficial del Proyecto
**Estado:** Aceptado — Referencia absoluta de comportamiento funcional
**Versión:** 1.0.0
**Fecha:** 2026-07-27
**Alcance:** Windows, macOS, Linux

---

## Índice

1. Inicio de la aplicación
2. Dashboard principal
3. Gestión del entorno
4. Gestión de herramientas
5. Gestión de proveedores de IA
6. Gestión de credenciales
7. Gestión de perfiles
8. Gestión de proyectos
9. Adaptadores
10. Backups
11. Migración
12. Logs
13. Configuración
14. Actualizaciones
15. Estados del sistema
16. Flujo completo de uso
17. Relación con ADR-001
18. Control de versiones del documento

---

## Nota de alcance

Este documento describe **comportamiento observable por el usuario**, no implementación. No define lenguaje, framework, motor de interfaz ni tecnología de ningún tipo. Toda decisión técnica futura debe producir exactamente el comportamiento aquí descrito. Cualquier discrepancia entre una implementación futura y este documento se resuelve a favor de este documento, salvo revisión formal mediante un nuevo FRS que lo referencie explícitamente.

---

## 1. Inicio de la aplicación

### 1.1 Qué ocurre al abrir DWM

Al abrir DWM, el sistema ejecuta, en este orden, una secuencia de comprobaciones silenciosas antes de mostrar ninguna pantalla funcional:

1. Comprobación de existencia de `SISTEMA-DE-TRABAJO`.
2. Comprobación de integridad de la configuración interna (si existe).
3. Comprobación rápida del entorno (sistema operativo, disponibilidad general).
4. Determinación de si es primera ejecución o ejecución posterior.

Mientras se ejecutan estas comprobaciones, el usuario ve una pantalla de arranque que indica que el sistema se está preparando, sin detalle técnico salvo que algo tarde más de lo esperado.

### 1.2 Qué verifica

- Que `SISTEMA-DE-TRABAJO` existe y es accesible.
- Que la configuración interna no está corrupta.
- Que existe al menos un perfil o que se requiere crear uno.
- Que las credenciales almacenadas son legibles (no implica validarlas contra servicios externos en este momento; eso es una acción explícita, ver sección 6).
- Que la última operación crítica (backup, restauración, migración, actualización) finalizó correctamente o quedó en un estado incompleto que requiere atención.

### 1.3 Qué muestra

Al finalizar la verificación, DWM presenta uno de dos flujos:

- **Flujo de primera ejecución** (sección 1.4), o
- **Dashboard principal** (sección 2), si ya existe configuración válida.

Si la verificación detecta una operación incompleta o un estado de advertencia/error, el usuario es dirigido al Dashboard, pero con la alerta correspondiente visible de forma prioritaria (ver sección 2.4).

### 1.4 Primera ejecución

Si no existe configuración previa, DWM inicia un asistente de bienvenida que:

1. Explica brevemente el propósito del sistema (gestionar el entorno de desarrollo desde `SISTEMA-DE-TRABAJO`).
2. Solicita al usuario confirmar o indicar la ubicación de `SISTEMA-DE-TRABAJO`.
3. Ejecuta un escaneo inicial del entorno (sección 3) y presenta un resumen de lo detectado.
4. Ofrece crear el primer perfil (sección 7), incluyendo, si el usuario lo desea, la primera conexión de un proveedor de IA (sección 5) y de las herramientas detectadas (sección 4).
5. Al finalizar, el usuario llega al Dashboard principal con un entorno mínimo ya operativo.

El usuario puede omitir pasos individuales del asistente; los pasos omitidos quedan reflejados en el Dashboard como pendientes, nunca como error.

### 1.5 Ejecuciones posteriores

Si ya existe configuración válida, DWM omite el asistente y accede directamente al Dashboard principal, reflejando el estado real y actualizado del entorno detectado en esa sesión.

---

## 2. Dashboard principal

### 2.1 Propósito

El Dashboard es la vista central y por defecto de DWM. Debe permitir, de un vistazo, entender el estado completo del entorno de desarrollo sin necesidad de navegar a ninguna sección concreta.

### 2.2 Información que debe mostrar

- Perfil activo actual.
- Resumen del entorno: sistema operativo detectado, herramientas gestionadas y su estado individual.
- Proveedores de IA configurados y su estado de conexión.
- Número de proyectos gestionados y su distribución por perfil.
- Estado del último backup (fecha, resultado).
- Estado de la última verificación del entorno.
- Alertas activas, ordenadas por severidad.
- Disponibilidad de actualizaciones (del propio DWM o de herramientas gestionadas).

### 2.3 Estados que existen a nivel de indicador

Cada elemento mostrado en el Dashboard (una herramienta, un proveedor de IA, una credencial, un backup) se representa siempre en uno de los estados definidos en la sección 15, nunca en un estado libre o ambiguo.

### 2.4 Alertas que puede mostrar

- Herramienta desactualizada o no detectada.
- Credencial inválida, caducada o no verificada.
- Proveedor de IA sin conexión.
- Backup no realizado en el intervalo esperado (si hay programación activa).
- Restauración o migración incompleta.
- Configuración corrupta o incompleta.
- Adaptador no compatible con la versión actual del núcleo.
- Actualización disponible (informativa, no bloqueante).

Las alertas se muestran priorizadas: primero errores, después advertencias, después informativas.

### 2.5 Navegación desde el Dashboard

Desde el Dashboard, el usuario accede a cualquiera de las secciones funcionales (entorno, herramientas, proveedores de IA, credenciales, perfiles, proyectos, adaptadores, backups, migración, logs, configuración, actualizaciones). El Dashboard no oculta información; asume la responsabilidad de resumir y dirigir al usuario a la acción correspondiente cuando existe una alerta.

---

## 3. Gestión del entorno

### 3.1 Qué puede detectar

- Sistema operativo y versión.
- Herramientas de desarrollo instaladas y su versión.
- Dependencias necesarias para dichas herramientas.
- Proveedores de IA previamente configurados y accesibles desde el equipo actual.
- Presencia o ausencia de `SISTEMA-DE-TRABAJO` en el equipo.

### 3.2 Qué puede verificar

- Que cada herramienta gestionada está en una versión compatible con lo esperado por el perfil activo.
- Que las credenciales necesarias para cada herramienta o proveedor de IA están presentes y no caducadas.
- Que la configuración aplicada coincide con la configuración esperada según el perfil activo (detección de "drift" o desviación).
- Que los adaptadores instalados son compatibles con la versión actual del núcleo.

### 3.3 Qué puede reparar

- Reaplicar configuración esperada cuando se detecta desviación.
- Reinstalar un componente detectado como dañado o incompleto.
- Regenerar una credencial marcada como inválida (solicitando al usuario los datos necesarios si aplica).
- Recrear estructuras internas de `SISTEMA-DE-TRABAJO` si faltan o están corruptas, sin afectar a datos de usuario existentes.

### 3.4 Qué puede instalar

- Herramientas de desarrollo soportadas mediante adaptador.
- Adaptadores nuevos, cuando el usuario decide ampliar el soporte de herramientas.
- Dependencias necesarias para el correcto funcionamiento de una herramienta gestionada.

### 3.5 Qué puede actualizar

- Herramientas gestionadas, a la versión objetivo definida por el perfil o por decisión explícita del usuario.
- Adaptadores, cuando existe una versión más reciente compatible con el núcleo.
- El propio DWM (ver sección 14).

### 3.6 Qué puede eliminar

- Herramientas gestionadas que el usuario decide retirar del entorno.
- Adaptadores que ya no se utilizan.
- Credenciales asociadas a una herramienta o proveedor retirado.
- Configuración obsoleta que ha quedado huérfana tras eliminar un elemento relacionado.

En todos los casos de eliminación, el usuario recibe una confirmación explícita, y la operación queda registrada en logs (sección 12) y contemplada por la política de backups (sección 10).

---

## 4. Gestión de herramientas

### 4.1 Cómo se muestran

Las herramientas se listan agrupadas por estado (activa, inactiva, desactualizada, con error) y muestran: nombre, versión detectada, versión objetivo (si aplica), perfil(es) que la utilizan y proveedor de IA asociado (si corresponde).

### 4.2 Cómo se agregan

El usuario selecciona una herramienta de un catálogo de herramientas soportadas (aquellas que disponen de adaptador, ver sección 9) y confirma su incorporación al perfil activo. DWM se encarga de detectarla si ya está instalada o de ofrecer su instalación si no lo está.

### 4.3 Cómo se eliminan

El usuario selecciona la herramienta y solicita su eliminación del perfil activo. DWM solicita confirmación, indicando si la eliminación afecta a otros perfiles que también la utilizan.

### 4.4 Cómo se actualizan

El usuario puede solicitar actualización individual de una herramienta o aceptar una actualización sugerida desde el Dashboard. La actualización se ejecuta a través del adaptador correspondiente y finaliza con verificación (sección 3.2).

### 4.5 Cómo se activan

Activar una herramienta significa incorporarla al conjunto de herramientas operativas del perfil activo, quedando disponible para su uso y para su asociación con proveedores de IA.

### 4.6 Cómo se desactivan

Desactivar una herramienta la retira temporalmente del conjunto operativo del perfil sin eliminar su configuración ni sus credenciales asociadas, permitiendo reactivarla posteriormente sin reconfiguración.

---

## 5. Gestión de proveedores de IA

### 5.1 Cómo agregar un proveedor

El usuario indica el proveedor de IA que desea añadir, proporciona la credencial necesaria (gestionada según sección 6) y, opcionalmente, el modelo por defecto a utilizar. DWM verifica la conexión antes de dar el proveedor por agregado.

### 5.2 Cómo modificarlo

El usuario puede modificar la credencial asociada, el modelo por defecto o cualquier parámetro de configuración del proveedor. Toda modificación se valida antes de aplicarse de forma definitiva.

### 5.3 Cómo eliminarlo

El usuario solicita la eliminación del proveedor. DWM advierte de qué herramientas quedarán sin proveedor de IA asignado como consecuencia, y solicita confirmación explícita.

### 5.4 Cómo probar la conexión

El usuario puede solicitar en cualquier momento una prueba de conexión para un proveedor concreto. El resultado se muestra como éxito, fallo de credencial o fallo de disponibilidad del servicio, sin ambigüedad.

### 5.5 Cómo cambiar el modelo por defecto

El usuario selecciona, de entre los modelos disponibles para ese proveedor, cuál debe utilizarse por defecto cuando una herramienta no especifica uno propio.

### 5.6 Cómo seleccionar qué herramientas utilizan cada proveedor

El usuario establece una relación explícita entre un proveedor de IA y una o varias herramientas. Esta relación es muchos a muchos: un proveedor puede alimentar a varias herramientas, y una herramienta puede tener asignado un proveedor concreto (o ninguno, si no requiere IA).

Ejemplo de relación gestionable por el usuario:

- Proveedor: DeepSeek → herramientas asociadas: Kilo Code, Continue, Cline, Cursor.

Esta relación es puramente funcional (qué usa qué); la integración técnica con cada herramienta es responsabilidad del adaptador correspondiente (ver ADR-001, sección 8).

---

## 6. Gestión de credenciales

### 6.1 Qué tipos de credenciales existen

- Credenciales de proveedores de IA (API keys).
- Credenciales de herramientas de desarrollo que las requieran (tokens de acceso, licencias).
- Credenciales de servicios auxiliares que el usuario decida integrar (repositorios, servicios de sincronización, etc.).

### 6.2 Cómo se crean

El usuario introduce la credencial en el contexto donde se necesita (al agregar un proveedor o herramienta) o de forma anticipada desde la sección de credenciales, quedando disponible para asociarse posteriormente.

### 6.3 Cómo se editan

El usuario selecciona la credencial existente y sustituye su valor. La edición no requiere reconfigurar manualmente las herramientas que la consumen; DWM propaga el cambio.

### 6.4 Cómo se eliminan

El usuario solicita la eliminación de una credencial. DWM advierte de qué proveedores o herramientas quedarán sin credencial asociada como consecuencia.

### 6.5 Cómo se validan

DWM ofrece una acción explícita de "probar credencial", que confirma si es aceptada por el servicio correspondiente, sin exponer el valor de la credencial en ningún momento.

### 6.6 Cómo se protegen

Toda credencial se almacena cifrada en reposo. Nunca se muestra en texto plano tras su creación; solo se permite sustituirla, no visualizarla, salvo mecanismos de revelación explícita y deliberada por parte del usuario si el sistema lo contempla como acción separada y confirmada.

### 6.7 Cómo se restauran

Las credenciales forman parte del contenido cifrado incluido en los backups (sección 10) y se recuperan como parte de un proceso de restauración (sección 3.3 / ADR-001 sección 15), nunca de forma aislada fuera de ese mecanismo.

---

## 7. Gestión de perfiles

### 7.1 Qué es un perfil

Un perfil es el conjunto identificable de configuración, herramientas activas, proveedores de IA asociados y preferencias que representa un contexto de trabajo concreto del usuario.

### 7.2 Cómo se crea

El usuario asigna un nombre al nuevo perfil y decide si parte de una configuración vacía o se basa en un perfil existente como plantilla.

### 7.3 Cómo se cambia

El usuario selecciona otro perfil como perfil activo desde el Dashboard o desde la sección de perfiles. DWM reconcilia automáticamente el entorno visible (herramientas activas, proveedores asociados) al perfil recién seleccionado.

### 7.4 Cómo se exporta

El usuario solicita exportar un perfil, generando un paquete portable que incluye su configuración normalizada (los secretos se incluyen cifrados, nunca en texto plano).

### 7.5 Cómo se importa

El usuario selecciona un paquete de perfil exportado previamente y solicita su importación. DWM valida su integridad y compatibilidad antes de incorporarlo, y advierte de cualquier conflicto con perfiles existentes (por ejemplo, nombre duplicado).

---

## 8. Gestión de proyectos

### 8.1 Cómo detecta proyectos

DWM identifica proyectos de desarrollo dentro de las ubicaciones que el usuario indique o dentro de `SISTEMA-DE-TRABAJO`, reconociendo la presencia de un proyecto por sus características observables (existencia de estructura de proyecto reconocible), sin requerir que el usuario lo registre manualmente si ya ha sido detectado.

### 8.2 Cómo clasifica proyectos

Los proyectos se clasifican según el perfil al que están asociados y, si aplica, según el tipo de proyecto detectado, permitiendo agrupaciones y filtrados coherentes en la interfaz.

### 8.3 Cómo muestra proyectos

Los proyectos se listan con: nombre, perfil asociado, herramientas relevantes para ese proyecto y estado general (operativo, con advertencias, no verificado).

### 8.4 Cómo abre proyectos

El usuario selecciona un proyecto y solicita abrirlo; DWM invoca a la herramienta configurada como editor/entorno principal para ese perfil o proyecto, delegando la apertura real en el adaptador correspondiente.

---

## 9. Adaptadores

### 9.1 Cómo aparecen

Los adaptadores se listan en una sección dedicada, mostrando: herramienta o sistema que gestionan, versión del adaptador, versión de contrato soportada y estado (compatible, desactualizado, incompatible).

### 9.2 Cómo se instalan

El usuario selecciona un adaptador desde un catálogo disponible y confirma su instalación. Un adaptador instalado queda disponible para su uso por parte del Tooling Manager sin pasos adicionales.

### 9.3 Cómo se actualizan

El usuario puede actualizar un adaptador de forma individual, o aceptar una actualización sugerida cuando DWM detecta una versión más reciente compatible.

### 9.4 Cómo se eliminan

El usuario solicita eliminar un adaptador. DWM advierte si existen herramientas que dependen de él y requiere confirmación explícita, dado que su eliminación implica la pérdida de gestión automatizada sobre la herramienta asociada.

### 9.5 Cómo se gestionan

La gestión de adaptadores es siempre explícita y visible para el usuario: nunca se instalan, actualizan o eliminan adaptadores de forma silenciosa sin que quede reflejado en el Dashboard y en los logs.

---

## 10. Backups

### 10.1 Qué incluye

- Configuración normalizada de perfiles, herramientas y proveedores de IA.
- Credenciales, en formato cifrado.
- Metadatos de proyectos gestionados.
- Estado de adaptadores instalados (identificación y versión, no el binario de la herramienta externa en sí).

### 10.2 Qué excluye

- Contenido propio de los proyectos de desarrollo del usuario (código fuente), que se asume gestionado por sus propios sistemas de control de versiones.
- Binarios de herramientas externas ya instaladas, que se reinstalan mediante adaptador en caso de restauración, no se copian literalmente.
- Cualquier dato temporal o de caché interna sin valor para la reconstrucción del entorno.

### 10.3 Cómo restaurar

El usuario selecciona un backup del histórico disponible y solicita su restauración. DWM informa antes de proceder de qué elementos se restaurarán y de si existe algún elemento incompatible con el equipo actual. Tras la restauración, se ejecuta verificación automática (sección 3.2).

### 10.4 Cómo programar backups

El usuario puede definir una frecuencia de backup automático (por ejemplo, al cerrar sesión de trabajo, de forma periódica) desde la sección de configuración, además de poder generar un backup manual en cualquier momento.

---

## 11. Migración

### 11.1 Cómo migrar un entorno completo

El usuario genera (o selecciona) un backup en el equipo de origen y lo transfiere al equipo de destino por el medio que prefiera (el mecanismo de transferencia en sí queda fuera del alcance funcional de DWM). En el equipo de destino, el usuario instala DWM y utiliza la opción de restauración/migración indicando el paquete recibido. DWM detecta si el sistema operativo de destino difiere del de origen y aplica la traducción necesaria de forma transparente para el usuario.

### 11.2 Cómo validar que la migración ha sido correcta

Al finalizar, DWM ejecuta la misma verificación automática que tras cualquier restauración (sección 3.2) y presenta al usuario un resumen explícito: qué se restauró correctamente, qué requiere intervención manual (por ejemplo, una herramienta no disponible para el nuevo sistema operativo) y qué credenciales necesitan revalidación.

---

## 12. Logs

### 12.1 Qué registra

Toda acción relevante ejecutada por cualquier módulo: instalaciones, actualizaciones, eliminaciones, cambios de configuración, backups, restauraciones, migraciones, errores y resultados de verificación.

### 12.2 Cómo se consultan

El usuario accede a una sección de logs filtrable por: fecha, módulo, perfil, proyecto y severidad (información, advertencia, error).

### 12.3 Cómo se exportan

El usuario puede exportar el histórico de logs (completo o filtrado) como archivo para compartir en caso de soporte o diagnóstico, garantizando que dicha exportación nunca contiene secretos en texto plano.

---

## 13. Configuración

### 13.1 Qué opciones existen

- Ubicación de `SISTEMA-DE-TRABAJO`.
- Frecuencia de backups automáticos.
- Perfil activo por defecto al iniciar.
- Preferencias de notificación de actualizaciones y alertas.
- Nivel de detalle de los logs.

### 13.2 Qué puede modificar el usuario

Todo lo listado en 13.1, así como la configuración específica de cada perfil, herramienta y proveedor de IA gestionado.

### 13.3 Qué nunca podrá modificar

- La estructura interna de `SISTEMA-DE-TRABAJO` de forma directa (solo a través de las acciones que DWM expone).
- El contrato de interfaz entre el núcleo y los adaptadores.
- El acceso directo a credenciales almacenadas (solo sustitución, no visualización en texto plano, según sección 6.6).

---

## 14. Actualizaciones

### 14.1 Cómo se notifican

Cuando existe una nueva versión de DWM, el Dashboard muestra una alerta informativa no bloqueante, indicando la versión disponible y un resumen de cambios relevantes.

### 14.2 Cómo se instalan

El usuario decide cuándo aplicar la actualización. Al confirmarla, DWM realiza automáticamente un backup previo (sección 10) antes de proceder, garantizando reversibilidad.

### 14.3 Cómo se revierten

Si una actualización produce un comportamiento no deseado, el usuario puede solicitar revertir a la versión anterior, lo cual restaura el backup generado automáticamente antes de dicha actualización (sección 14.2).

---

## 15. Estados del sistema

Todo elemento gestionado por DWM (herramienta, adaptador, proveedor de IA, credencial, backup, perfil, proyecto) se representa siempre en uno de los siguientes estados, sin estados adicionales no documentados:

| Estado | Significado |
|---|---|
| **Correcto** | El elemento funciona según lo esperado, sin ninguna acción pendiente. |
| **Advertencia** | El elemento funciona pero requiere atención (por ejemplo, versión desactualizada, backup próximo a vencer su intervalo). |
| **Error** | El elemento no funciona según lo esperado y requiere intervención. |
| **Actualizando** | El elemento está en proceso de instalación, actualización, restauración o migración. |
| **Pendiente** | El elemento ha sido reconocido pero aún no se ha completado su configuración (por ejemplo, una herramienta detectada pero no vinculada a un perfil). |
| **Sin configurar** | El elemento no ha sido configurado en absoluto (por ejemplo, un proveedor de IA sin credencial). |
| **Deshabilitado** | El elemento existe y está correctamente configurado, pero el usuario lo ha desactivado deliberadamente. |
| **Incompatible** | El elemento (típicamente un adaptador) no es compatible con la versión actual del núcleo. |

---

## 16. Flujo completo de uso

Descripción paso a paso, desde la instalación hasta un entorno completamente operativo:

1. El usuario instala DWM en su equipo.
2. Al abrir DWM por primera vez, se ejecuta el flujo de primera ejecución (sección 1.4).
3. El usuario confirma la ubicación de `SISTEMA-DE-TRABAJO`.
4. DWM escanea el entorno y presenta un resumen de herramientas detectadas.
5. El usuario crea su primer perfil.
6. El usuario agrega uno o varios proveedores de IA, introduciendo sus credenciales y probando la conexión.
7. El usuario asocia herramientas de desarrollo al perfil, ya sea detectadas automáticamente o instaladas por DWM a través de adaptadores.
8. El usuario asigna qué proveedor de IA utiliza cada herramienta.
9. El usuario revisa el Dashboard, donde ya se refleja el entorno operativo: herramientas activas, proveedores conectados, sin alertas críticas pendientes.
10. El usuario configura, si lo desea, la frecuencia de backups automáticos.
11. DWM genera el primer backup del entorno recién configurado.
12. El usuario comienza a trabajar con normalidad; DWM permanece disponible para detectar desviaciones, sugerir actualizaciones y mantener el entorno verificado.
13. Si en el futuro el usuario cambia de equipo, repite el paso 1 en el nuevo equipo y utiliza la opción de restauración/migración (secciones 10 y 11) para recuperar el entorno completo a partir del backup generado en el paso 11 (o posteriores), sin reconfiguración manual.

Este flujo constituye el criterio de aceptación funcional mínimo del producto: cualquier implementación de DWM debe permitir completar estos 13 pasos exactamente en este orden y con este resultado.

---

## 17. Relación con ADR-001

Este documento (FRS-001) describe comportamiento; ADR-001 describe arquitectura. Ninguna funcionalidad aquí descrita puede implementarse de una forma que contradiga los principios, módulos o reglas establecidos en ADR-001. En caso de conflicto aparente entre ambos documentos, debe resolverse mediante una revisión formal de ambos, nunca ignorando uno a favor del otro de manera implícita.

Correspondencia funcional–arquitectónica de referencia:

| Sección funcional (FRS-001) | Módulo(s) responsable(s) (ADR-001) |
|---|---|
| Inicio de la aplicación | Orquestador, Environment Scanner, Status Manager |
| Dashboard principal | Status Manager, Orquestador |
| Gestión del entorno | Environment Scanner, Tooling Manager, Verification Manager |
| Gestión de herramientas | Tooling Manager, Adapter Registry |
| Gestión de proveedores de IA | AI Manager, Secrets Manager |
| Gestión de credenciales | Secrets Manager |
| Gestión de perfiles | Profile Manager |
| Gestión de proyectos | Project Manager |
| Adaptadores | Adapter Registry, Plugin Manager |
| Backups | Backup Manager |
| Migración | Migration Manager |
| Logs | Log Manager |
| Configuración | Configuration Manager |
| Actualizaciones | Tooling Manager, Backup Manager, Verification Manager |
| Estados del sistema | Status Manager |

---

## 18. Control de versiones del documento

| Versión | Fecha | Descripción | Estado |
|---|---|---|---|
| 1.0.0 | 2026-07-27 | Versión inicial de la especificación funcional. Constituye FRS-001 y referencia absoluta de comportamiento del producto DWM. | Aceptado |

**Nota de gobernanza:** cualquier modificación futura de este documento debe realizarse mediante un nuevo FRS que referencie explícitamente FRS-001, indicando qué sección modifica y por qué. FRS-001 no se edita retroactivamente salvo corrección de erratas que no alteren su contenido funcional.

---

*Fin del documento — FRS-001 — Dev Workspace Manager (DWM)*
