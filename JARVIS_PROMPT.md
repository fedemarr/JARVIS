# PROYECTO JARVIS — Asistente personal de desarrollo y gestión

## 0. Rol y modo de trabajo

Actuás como desarrollador senior full-stack. Tu entregable **no es un documento de arquitectura**: es una aplicación corriendo en mi máquina, que arranco con un comando y con la que puedo hablar hoy.

Reglas no negociables:

1. **Construí, no propongas.** Si falta una dependencia, instalala. Si falta una carpeta, creala. Si algo falla, debuggealo y arreglalo.
2. **Verificá cada fase antes de seguir.** Al terminar cada fase levantás la app, ejecutás las pruebas de esa fase y me mostrás el output real. Si no pasa, no avanzás.
3. **Cero mocks, cero placeholders, cero `TODO`.** Si una tool está declarada, está implementada y devuelve datos reales. Nunca simules una respuesta del modelo ni inventes un resultado de herramienta.
4. **No me hagas preguntas de arquitectura.** Todas las decisiones importantes ya están tomadas abajo. Lo que no esté especificado, resolvelo por la opción más simple que funcione.
5. **Commit por fase**, con mensaje descriptivo.
6. Entorno: **Windows 11 + PowerShell**. Comandos, rutas y la tool de abrir editor tienen que funcionar ahí (no asumas bash/Linux).

---

## 1. Qué es JARVIS

Un **AI agent** personal, no un chatbot. Corre local, lo uso todos los días para dos cosas:

**Desarrollo** — analizar mis proyectos, leer código, explicar errores, correr comandos, abrir y ejecutar proyectos.

**Gestión diaria** — tareas, notas, recordatorios, seguimiento de clientes y proyectos, y un resumen del día cuando lo abro.

Tiene: cerebro (LLM), memoria (persistente y selectiva), herramientas (function calling), sentidos (mic + texto), voz (TTS) y contexto (mis proyectos cargados).

Dos requisitos de extensibilidad, ambos críticos:

- Agregar una tool nueva = crear **un solo archivo** en `tools/`. Nada más.
- Cambiar de proveedor de LLM = cambiar **una variable de entorno**. Nada más.

---

## 2. Stack — decisiones ya cerradas

| Capa | Elección |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind |
| Backend | Node 20 + TypeScript + Fastify |
| DB | **SQLite** con `better-sqlite3` |
| Acceso a datos | Repository pattern (`memory/repositories/*`) |
| LLM | **Capa `LlmProvider` propia** — implementación Gemini (`@google/genai`) + implementación Anthropic (`@anthropic-ai/sdk`) |
| STT | **Web Speech API** del navegador (`SpeechRecognition`, `lang: es-AR`) |
| TTS | **Web Speech API** (`speechSynthesis`, voz es-AR/es-ES) |
| Búsqueda web | API externa (Tavily o Brave Search) como tool común — **no** la búsqueda built-in del proveedor |
| Transporte | SSE (`text/event-stream`) |
| Monorepo | npm workspaces + `concurrently` |

Voz: definí `SttProvider` y `TtsProvider` en `shared/voice.ts` y que la implementación de navegador las cumpla, para poder enchufar Whisper/ElevenLabs después. **No implementes proveedores cloud de voz ahora.**

### `.env.example`

```env
LLM_PROVIDER=gemini          # gemini | anthropic
AI_MODEL=

GEMINI_API_KEY=
ANTHROPIC_API_KEY=

SEARCH_API_KEY=              # Tavily o Brave

PORT=3001
DB_PATH=./data/jarvis.db
ALLOWED_DIRS=C:/Users/Federico/Projects,C:/Users/Federico/Documents
USER_NAME=Federico
```

No hardcodees strings de modelo que no puedas verificar. Si no estás seguro del identificador exacto del modelo, buscalo en la doc oficial del proveedor antes de escribirlo.

---

## 3. Capa de proveedor de LLM — spec

Esto es lo primero que construís, y define todo lo demás. Voy a arrancar con Gemini y **más adelante le pongo la API key de Claude**, así que el agente nunca puede hablar con un SDK directamente.

`shared/llm.ts` — tipos normalizados, agnósticos del proveedor:

```ts
export type LlmRole = 'user' | 'assistant' | 'tool';

export interface LlmToolCall { id: string; name: string; args: Record<string, unknown>; }
export interface LlmToolResult { id: string; name: string; ok: boolean; content: string; }

export type LlmMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; results: LlmToolResult[] };

export type LlmEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_calls'; calls: LlmToolCall[] }
  | { type: 'end'; reason: 'stop' | 'tool_calls' | 'max_tokens' }
  | { type: 'error'; message: string };

export interface LlmProvider {
  stream(opts: {
    system: string;
    messages: LlmMessage[];
    tools: ToolDefinition[];
  }): AsyncIterable<LlmEvent>;
}
```

`backend/src/llm/gemini.ts` y `backend/src/llm/anthropic.ts` implementan esa interfaz. `backend/src/llm/index.ts` exporta una factory que lee `LLM_PROVIDER`.

**Implementá las dos.** Probá y verificá la de Gemini (es la que voy a usar ahora); la de Anthropic dejala completa y funcional, sin key configurada.

Detalles de traducción que tenés que resolver dentro de cada adaptador — **nunca filtrarlos al agent loop**:

- **Gemini**: las tools van como `functionDeclarations`; el fin de turno con herramientas se detecta buscando parts con `functionCall` (no hay `stop_reason: tool_use`); la respuesta vuelve como parts `functionResponse`. Streaming con `generateContentStream`.
- **Anthropic**: tools con schema JSON; `stop_reason === 'tool_use'`; resultados como bloques `tool_result`.
- **Llamadas en paralelo**: Gemini devuelve con frecuencia **varias `functionCall` en un mismo turno**. El evento `tool_calls` es un array y el loop tiene que ejecutar todas y devolver todos los resultados juntos. Si escribís el loop asumiendo una sola tool por iteración, se pierden llamadas en silencio. Este es el bug más probable de todo el proyecto — cuidalo.
- **IDs de llamada**: mapeá siempre el id del proveedor al `LlmToolCall.id`. Sin eso, con llamadas paralelas los resultados se cruzan.

**Sobre búsqueda web:** varios proveedores no permiten combinar su tool de búsqueda built-in con function declarations propias en el mismo request. Por eso `web_search` se implementa como una tool nuestra normal contra una API de búsqueda externa. No uses `googleSearch` ni equivalentes built-in.

---

## 4. Estructura

```
jarvis/
├── frontend/src/
│   ├── components/        # Orb, ChatMessage, ToolCard, ConfirmDialog, MicButton
│   ├── hooks/             # useChat (SSE), useSpeech
│   └── lib/
├── backend/src/
│   ├── llm/               # types, gemini.ts, anthropic.ts, index.ts (factory)
│   ├── agent/             # loop.ts, systemPrompt.ts
│   ├── tools/             # index.ts (registry) + un archivo por tool
│   ├── memory/            # db.ts, schema.sql, repositories/
│   ├── security/          # pathGuard.ts, commandGuard.ts, redact.ts
│   ├── api/               # routes
│   └── server.ts
├── shared/                # llm.ts, voice.ts, tipos comunes
├── data/                  # jarvis.db (gitignored)
└── .env.example / README.md / package.json
```

---

## 5. Contrato de API

```
POST /api/chat            body: { conversationId?, message } → SSE
POST /api/confirm         body: { pendingId, approved } → reanuda el run
GET  /api/conversations   lista
GET  /api/conversations/:id
GET  /api/projects | POST /api/projects
GET  /api/brief           resumen del día
GET  /api/health          incluye { provider, model }
```

Eventos SSE de `/api/chat`:

```
token                  { text }
tool_start             { id, name, args }
tool_result            { id, name, ok, summary }
confirmation_required  { pendingId, tool, args, reason }
done                   { conversationId, messageId }
error                  { message }
```

---

## 6. Agent loop — especificación

`backend/src/agent/loop.ts`. **Consume solo `LlmProvider` y tipos de `shared/llm.ts`.** No importa ningún SDK.

1. Cargar historial desde SQLite + inyectar memoria long-term relevante en el system prompt.
2. Llamar a `provider.stream(...)`, emitiendo `token` por cada evento `text`.
3. Al recibir `tool_calls` (array):
   - Para cada call, evaluar si es peligrosa (tool marcada `dangerous` **o** `commandGuard` la marca).
   - Si hay al menos una peligrosa → guardar el `RunState` completo en un `Map<pendingId, RunState>`, emitir `confirmation_required` y **pausar sin cerrar el stream**.
   - Si no → ejecutar **todas** (en paralelo con `Promise.allSettled`), emitir `tool_start`/`tool_result` por cada una, appendear un único mensaje `role: 'tool'` con todos los resultados y volver al paso 2.
4. `POST /api/confirm` recupera el `RunState`; si `approved` ejecuta y sigue, si no appendea un resultado con `"El usuario rechazó la ejecución"` y sigue.
5. Máximo **8 iteraciones** de tool por turno. Si lo supera, cortá y explicá por qué.
6. Una tool que tira excepción devuelve `{ ok: false, content: error }` al modelo — nunca revienta el stream.
7. Persistir cada mensaje (incluidos tool calls y resultados) en `messages`.

Registrar en `tool_logs`: tool, args redactados, resumen, status, duración, timestamp. **Nunca loguear secretos** (`redact.ts` filtra `key|token|secret|password|authorization`).

---

## 7. Herramientas

Cada tool es un archivo en `tools/` que exporta `{ name, description, schema (zod), dangerous, handler }` y se auto-registra en `tools/index.ts`. El registry genera los schemas en el formato de cada proveedor **desde el adaptador**, no desde la definición de la tool.

### Desarrollo
| Tool | Firma |
|---|---|
| `list_directory` | `(path, depth?)` — árbol, respeta `.gitignore` |
| `read_file` | `(path, maxBytes=100000)` |
| `write_file` | `(path, content)` — **dangerous** |
| `search_in_files` | `(query, path, glob?)` |
| `execute_command` | `(command, cwd)` — allowlist + guard |
| `git_status` | `(path)` — branch, cambios, últimos 5 commits |
| `open_in_editor` | `(projectName \| path)` — `code <ruta>` |
| `run_project` | `(projectName, script="dev")` — ventana nueva |

### Gestión diaria
| Tool | Firma |
|---|---|
| `create_task` | `(title, detail?, dueDate?, projectId?)` |
| `list_tasks` | `(filter: today\|pending\|overdue\|all, projectId?)` |
| `complete_task` | `(id)` |
| `create_note` | `(title, body, tags?)` |
| `search_notes` | `(query)` |
| `daily_brief` | `()` — fecha/hora, tareas de hoy, vencidas, proyectos activos, últimas notas |

### Memoria y utilidad
| Tool | Firma |
|---|---|
| `remember` | `(category, key, value)` |
| `recall` | `(query)` |
| `forget` | `(key)` |
| `list_projects` / `upsert_project` | |
| `get_current_time` | `()` — zona `America/Argentina/Buenos_Aires` |
| `calculator` | `(expression)` — `mathjs`, **nunca `eval`** |
| `web_search` | `(query)` — API externa, ver sección 3 |

---

## 8. Memoria

**Short-term**: últimos N mensajes de la conversación.

**Long-term**: tabla `memories`, categorías `preference | project | fact | task_context | note`.

Es **selectiva**: JARVIS llama a `remember` cuando yo digo explícitamente "acordate de X" **o** cuando detecta un dato estable y reutilizable (mi stack habitual, cómo trabajo, dónde vive un proyecto). No guarda charla casual ni cada frase.

Al inicio de cada run se inyectan las memorias `preference` y `project` en el system prompt (máx ~1500 tokens, más recientes primero).

### Schema

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY, title TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE memories (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT,
  path TEXT NOT NULL, stack TEXT, status TEXT DEFAULT 'active',
  notes TEXT, updated_at TEXT
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT,
  status TEXT DEFAULT 'pending', due_date TEXT,
  project_id TEXT REFERENCES projects(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
);
CREATE TABLE notes (
  id TEXT PRIMARY KEY, title TEXT, body TEXT NOT NULL, tags TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE tool_logs (
  id TEXT PRIMARY KEY, tool TEXT, args TEXT, result_summary TEXT,
  status TEXT, duration_ms INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

`schema.sql` idempotente, se corre al bootear.

---

## 9. Seguridad

- **`pathGuard`**: toda tool de filesystem resuelve la ruta y verifica que caiga dentro de `ALLOWED_DIRS`. Bloquea traversal (`..`), symlinks fuera del allowlist, y archivos `.env`, `*.pem`, `*.key`, `id_rsa*` incluso dentro de directorios permitidos.
- **`commandGuard`**: `execute_command` con allowlist de binarios (`npm`, `npx`, `node`, `git`, `python`, `pnpm`, `code`, `dir`, `tsc`). Marca peligroso y exige confirmación: `rm`, `del`, `rmdir`, `format`, `shutdown`, `git reset --hard`, `git push --force`, `git clean`, `npm publish`, redirecciones destructivas, `curl ... | sh`.
- Timeout de 60s por comando, output truncado a 20k chars.
- `write_file` siempre confirma.
- Secretos redactados en logs y en respuestas.

---

## 10. Interfaz

Escritorio, oscura, sobria, mono para el texto del sistema. Estética "consola futurista" — **no copies la UI de Iron Man**.

```
┌──────────────────────────────────────────────┐
│  J A R V I S                    [ ● online ] │
│                    ◉                         │
│                 LISTENING                    │
│ ──────────────────────────────────────────── │
│  Federico  ¿Cómo viene logística?            │
│  JARVIS    Revisando el proyecto...          │
│            ┌─ list_directory ───── ✓ 0.2s ─┐ │
│  ┌────────────────────────────────────────┐  │
│  │ Escribí un mensaje...            🎙️   │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

- Orb con estado: `IDLE` (respiración lenta), `LISTENING` (pulso), `THINKING` (rotación), `SPEAKING` (onda), `ERROR` (rojo).
- Tool calls como cards colapsables con nombre, args, duración y ✓/✗. Quiero **ver** qué ejecutó. Si hay varias en paralelo, se muestran todas.
- `confirmation_required` → diálogo con el comando exacto, el motivo y botones Ejecutar / Cancelar.
- Micrófono push-to-talk, con transcripción parcial visible mientras hablo.
- Respuesta hablada automática cuando el input fue por voz; botón mute global.
- Al abrir, se llama `/api/brief` y JARVIS saluda con el resumen del día.
- En un rincón, discreto: proveedor y modelo activos (de `/api/health`).

---

## 11. System prompt del agente

`agent/systemPrompt.ts`, editable en un solo lugar:

```
Sos JARVIS, el asistente personal de Federico — desarrollador en Buenos Aires.

Lo ayudás a programar, analizar proyectos, gestionar tareas y notas,
consultar información y automatizar trabajo repetitivo.

Tono: directo, preciso, profesional. Nada de "¡Claro! Estaré encantado de
ayudarte". Respondé como un colega competente: "Sí. Revisé el proyecto y
encontré el problema."

Reglas:
- Cuando algo se resuelve con una herramienta, USÁ la herramienta. No adivines
  el contenido de un archivo ni el estado de un proyecto.
- Nunca afirmes haber ejecutado una acción que no ejecutaste.
- Nunca inventes resultados. Si no sabés, decilo.
- Antes de acciones destructivas, pedí confirmación.
- Sé conciso salvo que Federico pida detalle.
- Español rioplatense, voseo.

Contexto actual:
{{fecha_hora}}
{{proyectos}}
{{memorias}}
```

---

## 12. Fases y checkpoints

No arranques la siguiente hasta que el checkpoint de la anterior pase **corriendo de verdad**.

**Fase 0 — Capa LLM.** `shared/llm.ts`, `llm/gemini.ts`, `llm/anthropic.ts`, factory, y un script `npm run llm:test` que manda "decime la capital de Francia" y una tool trivial.
> ✅ `LLM_PROVIDER=gemini npm run llm:test` responde y ejecuta la tool. El mismo script con `anthropic` compila y arranca (falla solo por falta de key).

**Fase 1 — Chat.** Monorepo, servidor, frontend, `/api/chat` con SSE, persistencia en SQLite.
> ✅ Le escribo "hola", responde en streaming, refresco la página y el historial sigue ahí.

**Fase 2 — Voz.** Web Speech API, push-to-talk, TTS, estados del orb.
> ✅ Aprieto el mic, digo "contame qué es una API REST", lo transcribe, responde, lo escucho.

**Fase 3 — Tools + confirmación.** Registry, tools de utilidad y filesystem, guards, cards, flujo de confirmación completo.
> ✅ "¿Qué hora es?" / "Calculá 15% de 340000" / "Listá los archivos de C:/Users/Federico/Projects" / "Borrá la carpeta test" → aparece el diálogo, cancelo, no se borra nada.
> ✅ **"¿Qué hora es y cuánto es 200 por 3?"** → ejecuta las dos tools en el mismo turno, se ven dos cards. Esto valida el manejo de llamadas paralelas.

**Fase 4 — Memoria y proyectos.** Memorias, tabla projects, seed con al menos un proyecto real mío.
> ✅ "Acordate de que uso TypeScript siempre" → conversación nueva → "¿Qué lenguaje uso?" → responde bien.

**Fase 5 — Gestión.** Tareas, notas, `daily_brief`, saludo con resumen al abrir.
> ✅ "Anotá que tengo que facturar el jueves" → "¿Qué tengo pendiente?" → aparece.

**Fase 6 — Dev assistant.** `execute_command`, `git_status`, `open_in_editor`, `run_project`, `search_in_files`, análisis de errores.
> ✅ "Abrí mi proyecto de logística" → abre VS Code. "Corré git status ahí" → output real. Le pego un stack trace → me dice la causa.

**Fase 7 — Polish.** Animaciones, errores visibles, README completo (instalación, config, uso, troubleshooting, **y cómo cambiar de proveedor**).

---

## 13. Criterio de aceptación

Abro la app y esta secuencia funciona entera, sin que yo toque una terminal:

1. Abro → me saluda con el brief del día.
2. "¿Qué podés hacer?" → lista real de sus capacidades.
3. Por voz: "Anotá que mañana tengo que llamar al cliente" → confirma, queda guardado.
4. "Acordate de que mi proyecto principal es la app de logística."
5. Cierro, abro de nuevo, "¿Cuál es mi proyecto principal?" → correcto.
6. "Listame los archivos de la app de logística" → árbol real.
7. "Leé el package.json y decime qué scripts tiene" → correcto.
8. "Abrila en VS Code" → abre.
9. "Corré git status" → output real.
10. Le pego un error de TypeScript → diagnóstico útil.
11. "Buscá qué versión de Node conviene usar hoy" → busca en la web.
12. "Borrá node_modules" → pide confirmación antes de ejecutar.
13. Cambio `LLM_PROVIDER` en el `.env`, reinicio, y **todo lo anterior sigue funcionando igual**.

Levanto todo con:

```bash
npm install
cp .env.example .env   # completo GEMINI_API_KEY
npm run dev
```

---

## 14. Fuera de alcance

ESP32, wake word, app mobile, multiusuario, auth, pagos, fine-tuning, modelos locales, Docker, microservicios, tests unitarios exhaustivos.

Si sobra tiempo, agregá al README una sección corta de cómo se integraría después: (a) migración SQLite → Supabase vía los repositories, (b) STT/TTS cloud vía los adapters de voz, (c) un ESP32 con mic/parlante hablándole al mismo endpoint `/api/chat`.

---

**Empezá por la Fase 0 ahora. Cuando la termines, corré el script de prueba y mostrame el output real antes de seguir.**
