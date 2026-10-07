# JARVIS — Asistente personal

Asistente personal con interfaz web (chat), memoria long-term (SQLite), integración con n8n y herramientas de desarrollo. Backend en Node + TypeScript, frontend en React + Vite, monorepo npm.

## Arquitectura

La dirección actual del proyecto y las etapas para tickets laborales, acceso
a dos computadoras y asistencia personal están en [ROADMAP.md](ROADMAP.md).
El backend escucha en `127.0.0.1` por defecto; `HOST` configura esa dirección.
La versión publicada tiene acceso privado y memoria PostgreSQL en Neon.
Ahora puede buscar información en internet, leer páginas públicas y consultar
el clima actual por ciudad. Ver [consultas de internet](backend/src/internet/README.md).
La conexión entre computadoras sigue pendiente. Ver [DEPLOYMENT.md](DEPLOYMENT.md).

### Jarvis Desktop y voz natural

Primera versión local en **http://127.0.0.1:3002**: lectura de proyectos autorizados,
estado de Git y archivos de texto que se pueden revisar y enviar al chat de Claude.
Voz masculina en español Alex con Kokoro en CPU, sin API de voz paga, y respaldo
del navegador. Iniciar con `npm run desktop` después de compilar y configurar
las carpetas privadas. Ver [Desktop Agent](desktop-agent/README.md) y
[instalación de voz](voice-local/README.md).

El acceso a la PC desde el celular, la escritura y la ejecución de trabajos
siguen pendientes. La interfaz local usa la memoria existente de Neon mediante
HTTPS; esta versión no agrega tablas ni cambia la base de producción.

```
frontend/   React + Vite — chat, tarjetas de herramientas, confirmaciones, historial
backend/    Node + Fastify + TypeScript — SSE, herramientas, memoria SQLite local y PostgreSQL en nube
api/        Adaptador de Fastify para Vercel
shared/     Tipos compartidos entre backend y frontend
n8n/        Automatizaciones y documentación de integración
data/       Base SQLite (jarvis.db) — no versionada
```

## Requisitos

- Node 20+ (probado con 24)
- Una API key de Gemini o Anthropic (ver `.env.example`)
- n8n (opcional, para automatizaciones)

## Setup

```bash
npm install
cp .env.example .env   # completar las API keys
npm run dev            # backend :3001 + frontend :5173
```

El backend sirve el build de producción del frontend en `http://localhost:3001`; el frontend de dev corre en Vite con proxy a `/api`.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Backend + frontend en modo watch |
| `npm run build` | Build de backend y frontend |
| `npm run start` | Backend en producción |
| `npm run llm:test` | Check de conexión con el proveedor LLM |
| `npm run n8n:test` | Check de conexión con n8n |
| `npm run typecheck` | Typecheck de backend y frontend |

## Configuración (`.env`)

| Variable | Descripción |
|---|---|
| `LLM_PROVIDER` | `gemini` o `anthropic` |
| `AI_MODEL` | Modelo del proveedor |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Keys del proveedor |
| `SEARCH_API_KEY` | Key opcional para búsqueda web |
| `PORT` | Puerto del backend (3001) |
| `DB_PATH` | Ruta de la base SQLite |
| `ALLOWED_DIRS` | Directorios a los que JARVIS puede acceder (separados por coma) |
| `USER_NAME` | Nombre de usuario en el system prompt |
| `N8N_BASE_URL` / `N8N_API_KEY` / `JARVIS_BASE_URL` | Integración n8n |

## Uso

La web está en https://jarvis-eta-blue.vercel.app. La clave personal de ingreso
está en el archivo local `data/jarvis-access-key.txt`, excluido de GitHub.
Tocá la **J central** para escuchar «Buenas, Federico. ¿En qué puedo ayudarte?»
con ondas y luces mientras habla. El saludo no consume la API; el chat usa
Claude Haiku 4.5 y sí consume saldo. La voz depende del navegador y puede elegirse
en el selector. Las respuestas se leen completas en una cola de segmentos cortos;
un fragmento nuevo no corta el anterior. Silenciar o iniciar otra misión detiene
la lectura. El núcleo azul tiene anillos giratorios y barrido circular, respetando
la preferencia del dispositivo para reducir movimiento.
En escritorio, el chat y sus controles están a la derecha del núcleo. En el
celular se apilan para mantener el editor legible.

**Manos libres:** activá el botón, concedé permiso al micrófono y decí «Jarvis».
Responde «Te escucho, Federico. ¿Qué necesitás?» y escucha tu pedido. También
podés decir «Jarvis, ayudame a estudiar» directamente. Después de cada respuesta
completa vuelve a escucharte, sin repetir su nombre. Decí «descansá» o «dormí»
para volver a esperar la palabra Jarvis, o desactivá el botón para detener el
micrófono. No escucha mientras habla. La función requiere una web abierta y
reconocimiento de voz disponible en el navegador; no es una activación global
del sistema operativo. El permiso del micrófono debe concederlo el usuario.
Las pruebas automatizadas simulan reconocimiento y audio: falta verificar el
micrófono y el reconocimiento real en el equipo de Federico.
En la nube están disponibles memoria, tareas, notas y análisis
de tickets; el control de computadoras y la conexión con Claude Code siguen pendientes.

La interfaz tiene una consola de mando con un núcleo animado y accesos para
OhlimpiaERP, tareas, estudio y marketing. Los accesos preparan mensajes editables.
**Importar ticket** carga archivos `.md` o `.html` (hasta 64 KB y 32.000 caracteres)
en el editor; el contenido se envía al modelo cuando apretás Enviar. El HTML se
convierte a texto. Todavía no hay integración directa con la nube de OhlimpiaERP
ni con Claude Code.

En Windows, usá `npm.cmd run dev` y abrí `http://localhost:3000` para desarrollo.
Después de compilar, `npm.cmd run start` sirve la interfaz en el puerto 3001.
La prueba `node frontend/ui-smoke.cjs` comprueba el flujo de la interfaz con una
API simulada y guarda capturas de escritorio y móvil en `artifacts/`.

1. `npm run dev` y abrir http://localhost:3001.
2. Al abrir, JARVIS saluda con el resumen del día (tareas, clima, proyectos).
3. Escribí o apretá el micrófono (push-to-talk) y hablá en español.
4. Cuando el input es por voz, JARVIS responde hablando (TTS). Hay mute global.
5. Las acciones peligrosas piden confirmación con el comando exacto.

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| La app no abre / dice "Failed to fetch" | Backend caído | `npm run dev` y ver `http://localhost:3001/api/health` |
| No responde en chat | Falta `GEMINI_API_KEY` o `AI_MODEL` inválido | Revisar `.env`, correr `npm run llm:test` |
| No habla por voz | Voz no seleccionada o mute activo | Elegir voz en el dropdown, desactivar mute, recargar (Ctrl+F5) |
| `web_search` falla | Falta `SEARCH_API_KEY` | Poner una key de Tavily o Brave en `.env` |
| Error al ejecutar workflows n8n | n8n apagado, key mal, o workflow inactivo | `cd n8n && docker compose up -d`, chequear `npm run n8n:test` |
| `browser` falla con error de Playwright | Navegador Chromium no descargado | En `backend/`: `npx playwright install chromium` |
| `JARVIS_BASE_URL` falla desde n8n | Backend no alcanzable desde el contenedor | Ver `n8n/README.md` (usar `host.docker.internal`) |
| Crash de libuv en tests de n8n | `process.exit` con timers vivos | Ya corregido en el repo; no reintroducir `AbortSignal.timeout` |

## Herramientas del agente

**Sistema / archivos:** `get_current_time`, `calculator`, `list_directory`, `read_file`, `write_file`, `search_in_files`, `execute_command` (allowlist + guard contra destructivos), `web_search`

**Navegador:** `browser` — Chromium headless con sesión persistente: `open` (navega y lee), `extract` (texto visible), `click` y `type` (requieren confirmación), `screenshot` (guarda en `data/browser/`), `close`

**n8n:** `n8n_list_workflows`, `n8n_run_workflow`, `n8n_execution_status`

**Memoria:** `remember`, `recall`, `forget` — las memorias de preferencias y proyectos se inyectan en el system prompt de cada conversación.

**Proyectos:** `list_projects`, `upsert_project`, `git_status`, `open_in_editor`, `run_project`

**Gestión:** `create_task`, `list_tasks`, `complete_task`, `create_note`, `search_notes`, `daily_brief` — al abrir la web, JARVIS saluda con el resumen del día (`GET /api/brief`).

Las herramientas peligrosas requieren confirmación del usuario en la UI antes de ejecutarse.

## API principal

- `POST /api/chat` — chat con streaming SSE (`conversation_id` opcional; si no se envía, crea una nueva conversación)
- `POST /api/confirm` — aprobar/rechazar una herramienta que pidió confirmación
- `GET /api/conversations`, `GET /api/conversations/:id` — historial
- `GET /api/health` — estado del proveedor/modelo
- `GET /api/brief` — resumen del día (tareas, proyectos, notas)

## Verificación

Después de cambios, correr `npm run typecheck`. Para probar la conexión LLM/n8n: `npm run llm:test` y `npm run n8n:test`.

## Cambiar de proveedor de LLM

El agente nunca habla con un SDK directamente: consume la capa `LlmProvider`
(`backend/src/llm/`). Para cambiar de proveedor:

1. Editar `.env` → `LLM_PROVIDER=anthropic` y completar `ANTHROPIC_API_KEY`.
2. Reiniciar el backend.
3. Todo lo demás (tools, memoria, chat, voz) funciona igual.

Verificar con `npm run llm:test` (el adaptador Anthropic está implementado y
compila; falla solo si no hay key).

## Integraciones futuras

- **SQLite → Supabase**: los repositories de `backend/src/memory/repositories/`
  aislan el acceso a datos; migrar es reemplazar la implementación.
- **STT/TTS cloud (Whisper/ElevenLabs)**: `shared/voice.ts` define
  `SttProvider`/`TtsProvider`; hoy solo hay la implementación de navegador en
  `frontend/src/lib/browserVoice.ts`. Enchufar un provider cloud no toca la UI.
- **ESP32 con mic/parlante**: puede hablarle al mismo endpoint `POST /api/chat`
  vía SSE.
- **Workflows nuevos en n8n**: ver `n8n/README.md` (agregar JSON + registry).

## Fuera de alcance

ESP32, wake word, app mobile, multiusuario, pagos, fine-tuning, modelos
locales, WhatsApp (ver `JARVIS_N8N_PROMPT.md` §10).

