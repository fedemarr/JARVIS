# Jarvis Desktop: primera versión

La interfaz local usa el mismo chat y memoria de Jarvis publicado en Vercel, con una conexión HTTPS saliente. La sesión remota permanece en el proceso de Node; las claves no se entregan al navegador. No se modifica el esquema de Neon.

En esta etapa se puede consultar Git, navegar carpetas y cargar archivos de texto al cuadro del chat. El usuario revisa y envía el contexto: no se suben carpetas completas ni archivos automáticamente. El análisis del chat sigue consumiendo la API de Claude configurada. El lector no ejecuta comandos arbitrarios ni escribe en los proyectos.

## Iniciar

1. `npm ci` y `npm run build` desde la raíz del repositorio.
2. Copiar `desktop-agent/projects.example.json` a `data/desktop-projects.json` y establecer exclusivamente proyectos autorizados, usando sus raíces de Git.
3. Conservar la clave personal de Jarvis en `data/jarvis-access-key.txt`.
4. Ejecutar `npm run desktop` para una consola, o `powershell -File desktop-agent/start.ps1` para iniciar en segundo plano.
5. Abrir http://127.0.0.1:3002 e ingresar la misma clave de Jarvis.

El servicio escucha únicamente en `127.0.0.1`, valida Host y Origin y exige sesión para las lecturas. Excluye `.env`, credenciales habituales, enlaces/junctions, carpetas privadas y archivos binarios. Un detector adicional bloquea patrones comunes de secretos dentro del texto; no sustituye la revisión del contenido antes de enviarlo al chat. Git usa argumentos fijos, no shell, y desactiva fsmonitor y escrituras opcionales.

## Voz

Ver [voice-local](../voice-local/README.md). La voz Alex se usa automáticamente en la interfaz local; si el motor está ocupado, no está instalado o la reproducción falla, continúa la voz del navegador. La cola lee todos los fragmentos y cancelar interrumpe la reproducción. Los archivos HTML se entregan como texto: no se ejecutan.

## Alcance actual

No es todavía un agente remoto del celular. El sitio de Vercel muestra un enlace para abrir la interfaz local **en esta PC**; `127.0.0.1` en un teléfono apunta al teléfono. No hay servicio de inicio automático, ejecución de tests, modificaciones, integración con Claude Code/Codex, push/deploy remoto ni lectura automática solicitada por el modelo. No se abrieron puertos del router.

La siguiente etapa necesita vinculación con credenciales individuales revocables, heartbeat y cola persistente de trabajos de lectura entre el agente y la nube. Probar sus migraciones en una rama aislada de Neon antes de llevarlas a producción. Agregar ejecución o escritura exige políticas y aprobación explícita por operación, además de una autenticación adecuada para el acceso remoto.

Validación: `npm test -w backend`, `npm run typecheck`, `npm run build`, `node frontend/ui-smoke.cjs`.
