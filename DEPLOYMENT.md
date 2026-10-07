# Publicación de Jarvis

Repositorio elegido: https://github.com/fedemarr/JARVIS

## Estado

El 7 de octubre de 2026, `git ls-remote` pudo consultar el repositorio y no
devolvió referencias: todavía no hay ramas publicadas. La aplicación local
compila y tiene pruebas de interfaz con una API simulada. No está desplegada.
La carpeta local está vinculada a ese repositorio como `origin`.

Equipo de Vercel elegido: `fmcodes-projects`. La sesión de CLI permite consultarlo;
en la consulta del 7 de octubre de 2026 no existe todavía un proyecto `jarvis`.
El proyecto existente `ohlimpiaerp` es independiente de este despliegue.

## Distribución prevista

- Código: repositorio público de GitHub, excluyendo datos y credenciales.
- Interfaz React/Vite: Vercel.
- Backend Fastify y memoria: servicio persistente, con autenticación.
- Herramientas de PC: agentes instalados en cada computadora, conectados al
  coordinador. Un despliegue web no tiene acceso automático a esas computadoras.

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

El archivo `vercel.json` de la raíz define estos ajustes. La instalación se
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
