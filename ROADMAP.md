# Jarvis: dirección del proyecto

Objetivo: construir un asistente personal que ayude a Federico con actividades
diarias, use internet y actúe en sus dos computadoras, con acceso desde el celular.
Más adelante, incorporar
flujos de trabajo concretos. Este documento guía las próximas iteraciones;
las capacidades propuestas no están implementadas todavía.

## Base observada el 7 de octubre de 2026

- Backend Fastify y TypeScript; interfaz React y Vite.
- Adaptadores de Gemini y Anthropic, conversación con herramientas y streaming.
- Memoria e historial en SQLite; tareas, notas y proyectos.
- Voz en el navegador y automatización de Chromium con Playwright.
- Búsqueda con Tavily e integración con workflows de n8n.
- Herramientas de archivos y terminal, límites de rutas y confirmaciones.
- `npm.cmd run typecheck` pasa en backend y frontend.

La compilación de tipos no verifica las claves, la respuesta de los modelos,
el micrófono, Chromium ni los workflows. Esas pruebas quedan pendientes.

## Primera etapa: un asistente local confiable

Avance publicado: chat real con Claude Haiku 4.5, sesión privada y memoria,
historial, tareas y notas en Neon Free. La J central saluda con voz del navegador
y animación. Se verificaron respuesta real, persistencia tras recargar y acceso
desde una vista móvil; el control de PC y la integración de OhlimpiaERP siguen pendientes.
Actualizar Vite/Tailwind y sus dependencias de desarrollo en una iteración aparte.

Nuevo avance local: agente dedicado en `127.0.0.1:3002`, con sesión privada,
proyectos explícitos, lectura protegida de texto y Git con argumentos fijos.
La interfaz permite revisar contexto antes de enviarlo a Claude por HTTPS.
La web publicada integra esos proyectos y la voz local mediante un puente autenticado
con permisos acotados y credenciales temporales. El conector puede iniciar con Windows
en segundo plano; no hace falta abrir una interfaz Desktop aparte. Se corrigió la
activación de manos libres durante respuestas para que espere sin cortar la lectura.
Kokoro ONNX con voz Alex en español corre en CPU; se comprobó generación de WAV
y reproducción desde la J. Se verificaron Git de OhlimpiaERP, bloqueo de secretos
y respuesta real por el proxy. No hay todavía vinculación remota del celular,
trabajos persistentes, cambios automáticos ni ejecución de Claude Code/Codex.

Prioridad confirmada por Federico: resolver tickets del trabajo. Luego ampliar
a desarrollo, vida social, estudio y marketing de su empresa.

El primer flujo debe tomar un ticket, identificar el problema y la información
faltante, consultar documentación autorizada y preparar una solución verificable.
Cuando sea un problema de código, proponer cambios y ejecutar las pruebas
pertinentes. Cuando sea soporte, preparar diagnóstico, pasos y respuesta.
Registrar el resultado y dejar el envío o cierre para revisión hasta acordar
qué acciones puede realizar Jarvis de forma autónoma.

Plataforma confirmada: OhlimpiaERP, un sistema propio en la nube. Los empleados
suben arreglos y mejoras; Federico descarga tickets .md y .html a la carpeta
del ERP y los resuelve con Claude Code siguiendo lógica, estructura y buenas
prácticas. La interfaz de Jarvis permite importar el texto de esos archivos,
revisarlo en el editor y enviarlo al chat para análisis. No hay conexión directa
con la nube del ERP ni con Claude Code todavía. Falta la ruta del proyecto y un
ticket representativo para verificar una solución real.

Además, elegir actividades cotidianas y probarlas de punta a punta. Posibles casos:
crear una tarea y recuperarla al reiniciar; guardar una preferencia y recordarla;
buscar información y devolver enlaces; consultar un archivo permitido.

Agregar diagnóstico de configuración sin revelar claves, errores claros y
pruebas del ciclo de herramientas. Verificar rechazo y vencimiento de
confirmaciones, recuperación de memoria y cancelación al desconectar el chat.

Criterio de avance: las tareas elegidas se completan con evidencia del resultado
y los fallos se explican sin afirmar que una acción ocurrió cuando no ocurrió.

## Segunda etapa: actuar en esta computadora

Revisar los controles antes de ampliar el acceso. La lista de ejecutables de
terminal no limita lo que pueden hacer `node`, `python` o un script de npm.
Resolver enlaces y junctions correctamente para impedir escapes de las carpetas
permitidas. Definir acciones concretas y permisos por herramienta.

Incorporar automatización del escritorio cuando haya una tarea que la necesite:
observar ventana o captura, realizar una acción y comprobar el resultado.
Pedir confirmación para borrar, enviar mensajes, comprar o cambiar ajustes
sensibles. Registrar qué se pidió, qué se ejecutó y qué resultado se obtuvo.

Criterio de avance: completar una tarea acordada en una aplicación local y
demostrar que una acción rechazada no se ejecuta.

## Tercera etapa: conectar la computadora de casa

Arquitectura propuesta:

```text
Interfaz de Federico → coordinador Jarvis → modelo y herramientas de internet
                              ↓
                    dispositivos autenticados
                         ↙             ↘
                 agente PC actual   agente PC de casa
```

Cada equipo necesita un agente instalado y vinculado explícitamente. Preferir
conexiones salientes autenticadas a un coordinador, sin abrir una terminal
directamente a internet. Las tareas deben indicar el equipo de destino, tener
identificador, vencimiento y registro de resultados; evitar repetir acciones
al reconectar. Permitir revocar un dispositivo y detener una tarea.

Criterio de avance: consultar ambos equipos, ejecutar una acción permitida en
el equipo elegido y manejar que la PC de casa esté apagada.

## Cuarta etapa: rutinas y trabajo

Añadir calendario, correo, documentos y recordatorios según las tareas elegidas.
Separar información personal y laboral, cuentas, permisos y memorias. Empezar
los flujos laborales con lectura y borradores revisables. Ampliar autonomía por
acción después de comprobar resultados, costos y recuperación ante fallos.

## Acceso desde el celular

Objetivo confirmado: usar el mismo Jarvis desde el teléfono, con memoria e
historial compartidos. La interfaz ya se adapta a pantallas pequeñas; todavía
no hay acceso remoto, instalación como app ni notificaciones.

Después de implementar autenticación y conectividad remota, preparar una web
instalable (PWA) como primera versión móvil. Permitir conversar, usar voz según
las capacidades del navegador, importar tickets y consultar el avance de tareas.
Las acciones sobre las computadoras se ejecutan en sus agentes; el celular
permite elegir el equipo, enviar una misión y revisar las confirmaciones.

Mantener estado de tareas y resultados en el coordinador para que cerrar la
pantalla o perder conexión no duplique ni apruebe acciones. Incorporar
notificaciones con permiso del usuario. Evaluar una app nativa cuando una
necesidad concreta requiera integración adicional con Android o iOS.

Criterio de avance: enviar un ticket desde el teléfono, consultar el resultado
de una tarea en una PC y aprobar o rechazar una acción desde una sesión
autenticada. Probar desconexión, reconexión y revocación del acceso del teléfono.

## Publicación futura: Git y Vercel

Preferencia de Federico: alojar el código en un repositorio Git y publicar con
Vercel. Primera distribución prevista: repositorio privado (por ejemplo GitHub),
interfaz React/Vite en Vercel y backend coordinador en un servicio persistente.
Los agentes de las computadoras se conectarán al coordinador autenticado.

El backend actual guarda memoria en SQLite local y ejecuta herramientas de
sistema. No se puede trasladar sin cambios a funciones de Vercel: requieren
almacenamiento persistente externo y no tienen acceso a las PCs de Federico.
Antes de publicar, implementar autenticación, conexión del frontend al backend
y manejo de sesiones y confirmaciones para acceso remoto. Excluir del repositorio
claves, bases de datos, sesiones de navegador y archivos privados de tickets.

Código publicado en https://github.com/fedemarr/JARVIS y primera interfaz
publicada en https://jarvis-eta-blue.vercel.app el 7 de octubre de 2026.
El proyecto `jarvis` de `fmcodes-projects` está conectado al repositorio.
Backend remoto en preparación: Vercel + Neon Free, sin Render pago. La base
`jarvis-memory` ya está creada y probada; el código incluye sesión autenticada,
historial, memoria, tareas y notas. Falta la clave de Claude guardada y la
verificación del despliegue de ambos servicios. La web actual sigue siendo
la primera interfaz sin backend.

Referencias: [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite)
y [entornos de funciones](https://vercel.com/docs/functions/runtimes).

## Próxima información necesaria

Definir plataforma y ejemplo de ticket, el sistema operativo del equipo de casa
y qué aplicaciones se usan en el trabajo. Medir éxito por tareas completadas,
tiempo de respuesta y costo; elegir modelos a partir de esas mediciones.

## Ejecución local en Windows

```powershell
npm.cmd run typecheck
npm.cmd run dev
```

Abrir `http://localhost:3000` durante desarrollo (puerto configurado en Vite).
El backend usa `127.0.0.1:3001` por defecto y puede servir la interfaz compilada.
`HOST` permite cambiar la dirección de escucha. Aún falta autenticación para
acceso remoto: cambiar `HOST` no implementa la conexión entre computadoras.
Si n8n en Docker necesita acceder al backend desde fuera del loopback, hará falta
configurar esa conectividad y su autenticación antes de habilitarla.
