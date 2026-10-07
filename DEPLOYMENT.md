# Publicación de Jarvis

Repositorio elegido: https://github.com/fedemarr/JARVIS

## Estado

El 7 de octubre de 2026 se publicó el código en la rama `main` del repositorio
y se creó el proyecto `jarvis` en el equipo `fmcodes-projects`, conectado a GitHub.
La interfaz está publicada en https://jarvis-eta-blue.vercel.app.
El backend remoto todavía no está conectado: el chat no responde en esta versión.
La carpeta local está vinculada a ese repositorio como `origin`.
El proyecto existente `ohlimpiaerp` es independiente de este despliegue.

Verificación: despliegue READY; navegador contra el enlace público con respuesta
HTTP 200, importación de un ticket ficticio .md, estado sin backend y vista móvil
sin desborde horizontal. La compilación y las pruebas locales con API simulada
también pasaron. No se subieron claves, bases de datos ni perfiles de navegador.

## Distribución prevista

- Código: repositorio público de GitHub, excluyendo datos y credenciales.
- Interfaz React/Vite: Vercel.
- Backend Fastify y memoria: servicio persistente, con autenticación.
- Herramientas de PC: agentes instalados en cada computadora, conectados al
  coordinador. Un despliegue web no tiene acceso automático a esas computadoras.

## Backend gratuito preparado

Federico descartó el alojamiento pago. Se creó `jarvis-memory` en Neon,
exclusivamente en el plan `free_v3`, conectado a la producción del proyecto
`fmcodes-projects/jarvis`. Los términos de la integración fueron aceptados por
Federico. El código de nube está en `backend/cloud.ts` y `backend/src/cloud/`;
usa PostgreSQL sin depender de SQLite local y define el segundo servicio en
`vercel.json`. No se contrató Render ni se cambió el plan de Vercel.

Se verificaron conversaciones, memorias, tareas y notas contra PostgreSQL real
entre instancias independientes; las filas ficticias de prueba se eliminaron.
Las pruebas de autenticación y de herramientas Claude simuladas pasan. Se
actualizaron Fastify y plugins y npm reportó cero vulnerabilidades.

Pendiente: guardar `ANTHROPIC_API_KEY` en el `.env` local, configurar los secretos
de producción, probar una llamada pequeña a Claude y desplegar. Federico ya
autorizó guardar la clave de Anthropic y una nueva clave de acceso como secretos
solo en `fmcodes-projects/jarvis`. La configuración anterior de Gemini no se envió:
la revisión automática la rechazó antes de ejecutarla. No se eludió ese bloqueo.
El despliegue actual continúa siendo la interfaz sin backend mientras falta la clave.

## Requisitos antes de publicar una versión funcional

1. Implementar autenticación y protección de rutas de chat, memoria y acciones.
2. Elegir y preparar el alojamiento del backend y su almacenamiento persistente.
3. Configurar `/api` en la interfaz publicada para que llegue al backend por
   HTTPS. El proxy de Vite solo funciona durante desarrollo; no se publica.
4. Configurar las claves en el backend, nunca como variables `VITE_*`, que se
   incluyen en el código del navegador.
5. Verificar chat por streaming, importación de tickets, historial y
   confirmaciones contra el backend real desde una vista previa.

## Ajustes previstos en Vercel

Importar el repositorio como monorepo. Si se usa la raíz del repositorio como
Root Directory, los ajustes de la interfaz serán:

| Ajuste | Valor |
| --- | --- |
| Framework | Vite |
| Build Command | `npm run build -w frontend` |
| Output Directory | `frontend/dist` |
| Install Command | `npm ci --workspace frontend --include-workspace-root` |

El archivo `vercel.json` de la raíz define un único servicio `frontend`, con
raíz en el monorepo y estas opciones dentro del servicio. Una regla pública
dirige las peticiones a esa interfaz; no se despliega el backend. La instalación se
limita al workspace de la interfaz y las dependencias de la raíz, evitando
instalar el backend y SQLite en el despliegue del frontend.

No usar `npm run build` de la raíz para este despliegue de la interfaz: también
compila el backend, que requiere su propio alojamiento. Estos ajustes no
resuelven la conexión `/api`; queda pendiente definir el backend.

## Archivos excluidos del repositorio

`.env` y variantes privadas, `data/`, bases SQLite, `n8n/n8n_data/`, capturas
locales, builds, dependencias y `.vercel/`. Los tickets laborales deben
guardarse fuera del código público o en una carpeta de datos excluida.

Documentación oficial: [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite).
