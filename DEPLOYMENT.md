# Jarvis publicado

Web: https://jarvis-eta-blue.vercel.app
Repositorio: https://github.com/fedemarr/JARVIS
Proyecto Vercel: fmcodes-projects/jarvis.

## Versión funcional (7 de octubre de 2026)

La interfaz React/Vite y el backend Fastify están publicados en Vercel.
`api/index.ts` adapta Fastify a una función Node; `vercel.json` dirige `/api/*`
a esa función y sirve el build de la interfaz. La conexión es del mismo origen.
La salud y el estado de sesión responden sin esperar a la memoria; las
operaciones con datos inicializan el esquema cuando lo necesitan.

Claude Haiku 4.5 responde por streaming, con un máximo configurado de 512 tokens
por respuesta del modelo y cuatro iteraciones de herramientas por turno.
El chat consume el saldo de la API de Anthropic. El saludo al tocar la J usa
la voz del navegador y no llama al modelo. Su timbre depende de las voces
instaladas; la interfaz permite elegir una voz española disponible.

Neon guarda conversaciones, preferencias, tareas y notas. Se creó únicamente
`jarvis-memory` en el plan `free_v3`, tras la aceptación de términos de Federico.
No se contrató Render ni se cambió a un plan pago de alojamiento. Los servicios
gratuitos tienen cuotas y pueden suspenderse o tardar en despertar.

## Acceso y secretos

Las claves de Anthropic y de acceso están únicamente en variables de producción
y archivos locales excluidos. La clave de ingreso generada está en
`data/jarvis-access-key.txt`; no es la clave de Anthropic.
La sesión dura ocho horas y usa una cookie HttpOnly, Secure y SameSite=Strict.
Las rutas privadas exigen sesión; los orígenes se validan y los intentos de
login se limitan con registro persistente. No guardar credenciales en el chat.
La clave compartida por chat debe reemplazarse por una nueva en Anthropic.

Variables del backend: `DATABASE_URL`, `JARVIS_MODE=cloud`, `JARVIS_ACCESS_KEY`,
`ALLOWED_ORIGINS`, `LLM_PROVIDER=anthropic`, `AI_MODEL=claude-haiku-4-5`,
`LLM_MAX_OUTPUT_TOKENS=512` y `ANTHROPIC_API_KEY`. Nunca usar variables `VITE_*`
para secretos.

## Comprobaciones

Pasaron tipos, compilación y pruebas del backend: validación del chat,
autenticación, vencimiento y manipulación de cookies, bloqueo de intentos,
historial y reconstrucción de llamadas de herramientas de Claude.
La prueba del navegador verifica importación MD/HTML, envío manual, saludo
exacto al tocar la J, animación al hablar y vista móvil sin desborde.
La prueba de producción verificó ingreso, respuesta real de Claude, historial
tras recargar, saludo, vista móvil y cierre de sesión. También se verificaron
memorias, tareas y notas con PostgreSQL real entre instancias independientes.

Se corrigió la alerta crítica de dependencias con actualizaciones compatibles.
Quedan nueve alertas en herramientas de desarrollo relacionadas con Vite,
Tailwind y dependencias de CSS; su actualización requiere una migración separada.

## Capacidades y próximos pasos

Esta versión analiza tickets importados y usa memoria, tareas, notas, cálculos
y hora. La integración automática con OhlimpiaERP y Claude Code, el control de
computadoras, la búsqueda web y una aplicación móvil siguen pendientes.
Las herramientas de PC del servidor local no están expuestas en la nube.
El proyecto Vercel `ohlimpiaerp` no fue modificado.

`.env*` privados, datos, tickets, SQLite, perfiles de navegador, `node_modules`,
builds y `.vercel` están excluidos de GitHub. Revisar estos límites antes de
publicar nuevos archivos laborales.