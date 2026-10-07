# Backend de nube

Entrada de Vercel: `backend/cloud.ts`. La versión local sigue usando
`backend/src/server.ts` y SQLite. La nube usa Fastify y PostgreSQL por HTTP
con Neon Free; no necesita un disco local ni una cuenta de Render.

## Capacidades

Chat por streaming, historial persistente, preferencias, tareas y notas.
El análisis de tickets usa el texto importado desde la interfaz. No hay
acceso al repositorio de OhlimpiaERP, Claude Code ni a las computadoras.
Las herramientas de nube no incluyen terminal, archivos, navegador ni
acciones de envío o eliminación que requieran confirmación.

## Configuración privada

- `DATABASE_URL`: conexión de Neon que configura la integración de Vercel.
- `JARVIS_MODE=cloud`.
- `JARVIS_ACCESS_KEY`: clave aleatoria de al menos 32 caracteres.
- `ALLOWED_ORIGINS`: URL exacta de la interfaz; sin comodines.
- `LLM_PROVIDER`, `AI_MODEL` y la clave del proveedor correspondiente.

Estas variables se guardan solo en el backend. La clave de acceso genera una
cookie firmada HttpOnly, Secure en nube, SameSite=Strict, con duración de ocho
horas. No se guarda en localStorage. Cerrar sesión borra la cookie del navegador;
para revocar todas las sesiones, rotar `JARVIS_ACCESS_KEY`.

El límite de intentos de acceso persiste en PostgreSQL. Una reserva con
vencimiento impide dos turnos simultáneos, incluso entre instancias del backend.
Los turnos tienen límite de 150 segundos y cuatro iteraciones del modelo;
al desconectar se cancela la solicitud del modelo. Las operaciones ya realizadas
no se revierten automáticamente: verificar su resultado antes de repetir.

## Pruebas

`npm.cmd run test -w backend` verifica autenticación, origen, sesión manipulada,
vencimiento, límite de intentos, validación de mensajes, streaming e historial
con dobles de prueba, y bloqueo de herramientas de computadora.

La verificación de PostgreSQL real se ejecuta aparte usando un archivo local
excluido de Git; crea datos ficticios y elimina únicamente esas filas al terminar.

## Costos y disponibilidad

La base se crea exclusivamente en Neon Free. No se contrata Render ni se
actualiza el plan de Vercel. Los planes gratuitos y la API del modelo tienen
cuotas; el backend debe informar los fallos de cuota en lugar de prometer
disponibilidad ilimitada. No se migra al plan pago automáticamente desde el código.

Para las primeras pruebas con el saldo de Claude informado por Federico, usar
`LLM_PROVIDER=anthropic`, `AI_MODEL=claude-haiku-4-5` y
`LLM_MAX_OUTPUT_TOKENS=512`. El límite de salida reduce consumo, pero no mide
el saldo de Anthropic ni garantiza una cantidad fija de consultas. Antes de
una prueba real, verificar que la clave esté guardada y autorizada para el destino.
