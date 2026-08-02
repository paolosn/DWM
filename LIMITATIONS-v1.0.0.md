# Limitaciones reales — DWM v1.0.0

Documento operativo, no promocional. Cada limitación indica su causa exacta y, cuando
aplica, qué se necesitaría para resolverla.

## 1. Re-escaneo de recursos PSN en caliente

Al arrancar, el motor localiza automáticamente un Workspace portable existente
(`PortableWorkspaceManager.locateRoot()`) y escanea sus recursos PSN
(`PSNAdapter.scanWorkspace()`). Si el usuario crea o activa un Workspace **durante la
sesión en curso** (Onboarding/Workspaces → «Inicializar y activar»), ese escaneo no se
vuelve a disparar automáticamente: los recursos PSN (Agentes/Skills/Reglas/Conocimiento/
Clientes) requieren reiniciar la aplicación para detectarse. Causa: no existe todavía
un ciclo de vida de "Workspace activo cambia en caliente" que dispare un nuevo escaneo;
construirlo con seguridad (invalidar cachés, refrescar todos los managers dependientes)
es una pieza de diseño propia, no una conexión de una operación ya existente.

## 2. Sin persistencia de última ruta/ventana entre sesiones

No existe canal IPC para que el renderer guarde su última sección visitada o el tamaño
de ventana en `DesktopConfig`. `IpcContract` solo expone `invoke` (Application API) y
`getVersionInfo`. Documentado también en el Módulo 33A.

## 3. Application API: operaciones sin exponer

| Área                         | No disponible                                    | Motivo                                                                                                         |
| ---------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Logs                         | Cualquier consulta                               | Application API no expone `logs.*`. Adaptador tipado preparado en `logsAdapter.ts`, sin inventar la operación. |
| IA y proveedores             | Administrar proveedores/credenciales             | No hay operación pública; solo se lee `defaultAIProviderId` ya configurado por perfil.                         |
| Perfiles                     | Crear / editar / clonar / importar / eliminar    | Solo `profiles.list/get/activate` existen.                                                                     |
| Clientes                     | Duplicar                                         | No existe en el contrato (a diferencia de Agentes/Skills/Reglas/Conocimiento).                                 |
| Backups/Restore/Verification | Cancelar una operación en curso                  | No hay operación pública de cancelación.                                                                       |
| Workspace                    | Selector de carpeta nativo                       | No hay IPC para `dialog.showOpenDialog`; la ruta se escribe a mano.                                            |
| Entorno                      | Instalar/actualizar herramientas, modificar PATH | Fuera de alcance por diseño (documento §6/§34).                                                                |

## 4. Empaquetado: solo Linux verificado en este entorno

Se generó y **verificó de verdad** `DWM-1.0.0.AppImage` (arranca bajo Xvfb, logging
real observado). Windows (NSIS) y macOS (DMG) tienen su configuración completa en
`build/electron-builder.json5`, pero **no se generaron ni verificaron** en esta
entrega: este entorno de build es Linux sin Wine ni toolchain de macOS. No se afirma
haber producido ni probado esos instaladores.

## 5. Sin firma de código ni notarización

No hay certificados de firma (Windows/macOS) disponibles en este entorno. La
configuración de `electron-builder` no incluye firma; cualquier instalador generado
fuera de este entorno debería añadirla antes de una distribución real.

## 6. Sin actualización automática

No se implementó `autoUpdater` ni infraestructura de publicación (`publish: null` en
la configuración de electron-builder).

## 7. Icono placeholder

`packages/desktop-app/build/icon.png` es un icono generado programáticamente (sin
arte final de marca), claramente identificado como placeholder en el propio archivo
de configuración de empaquetado.

## 8. E2E con interfaz gráfica real

Este entorno no tiene un servidor gráfico persistente para automatizar clics reales
sobre una ventana Electron visible (herramientas tipo Playwright-Electron). Se verificó
en su lugar: (a) que el binario empaquetado arranca y ejecuta código real bajo Xvfb
(logging observado, sin crash del proceso hasta que se le envía la señal de cierre),
y (b) pruebas de integración reales de extremo a extremo contra `EngineBootstrap` con
managers reales y sistema de archivos real (sin mocks), cubriendo los flujos A, D y H
del documento del Módulo 34. No se simula ni se afirma haber ejecutado una suite E2E
de interacción de UI real.

## 9. Alcance explícitamente fuera de esta versión

Usuarios/roles, nube, Teams, login remoto, sincronización — no implementados por
decisión de alcance (documento del Módulo 33B/34), no por limitación técnica.

## 10. `WorkspaceManager` (genérico) vs `PortableWorkspaceManager` (disco)

`@dwm/workspace` (registro en memoria de "Workspaces" abstractos, usado por ejemplo
por el resolutor de recursos de backup) y `@dwm/portable-workspace` (el Workspace
portable real en disco) son managers distintos y no están sincronizados entre sí. Un
backup de `resourceType: "workspace"` con el `resourceId` del Workspace portable
activo no se resuelve automáticamente por esta vía; se documenta aquí en vez de
construir el puente entre ambos managers, que es una pieza de integración propia no
solicitada explícitamente.
