# JARVIS — INTEGRACIÓN n8n

> **Requisito previo:** este prompt se ejecuta **después** de que JARVIS pase la Fase 6 del spec principal. No lo corras antes: depende del tool registry, del flujo de confirmación y del schema de SQLite ya funcionando.

---

## 0. Prerrequisitos que resuelvo yo (Federico), no vos

Antes de empezar tengo que tener esto listo. Si falta alguno, **pedímelo y frená** — no inventes credenciales ni sigas asumiendo que existen.

- [ ] n8n corriendo y accesible (local con Docker, o cloud). Anotar la URL base.
- [ ] API key de n8n generada (Settings → API).
- [ ] Para la Fase 3 solamente: proyecto en Google Cloud con OAuth configurado para Gmail y Calendar, y las credenciales cargadas **dentro de n8n** (no en el `.env` de JARVIS).

---

## 1. Qué es JARVIS hoy

JARVIS es un agente personal en Node/TypeScript que ya tiene:

- `backend/src/llm/` — capa `LlmProvider` (Gemini/Anthropic intercambiables)
- `backend/src/agent/loop.ts` — agent loop con function calling, llamadas paralelas y pausa/reanudación para confirmaciones
- `backend/src/tools/` — registry: cada tool es un archivo con `{ name, description, schema, dangerous, handler }`
- `backend/src/security/` — `pathGuard`, `commandGuard`, `redact`
- `backend/src/memory/` — SQLite + repositories (`conversations`, `messages`, `memories`, `projects`, `tasks`, `notes`, `tool_logs`)
- Frontend React con SSE, cards de tool y diálogo de confirmación

**No existen** (no los invoques ni asumas que existen): Permission Manager, Local Agent, Browser Agent, API Agent, Dev Agent, Supabase. Si en algún momento necesitás algo de eso, **decímelo en vez de crearlo**.

---

## 2. Rol de n8n

n8n es el **sistema de automatizaciones** de JARVIS. Se encarga de lo que JARVIS no puede hacer solo porque requiere correr sin que yo esté presente:

- schedules y cron
- triggers por evento (mail entrante, webhook)
- procesos multi-paso entre servicios externos
- integraciones OAuth (Gmail, Calendar, GitHub)

JARVIS sigue siendo el que decide. n8n ejecuta.

**Lo que n8n NO hace:** ejecutar comandos en mi PC, controlar el navegador, tomar decisiones sobre qué herramienta usar, ni reemplazar tools que JARVIS ya tiene. Si JARVIS tiene una tool directa que resuelve algo, la usa — no lo mandes por n8n para "unificar".

---

## 3. Fase 0 — Auditoría (obligatoria, antes de escribir código)

1. Leé el repo. Listame qué módulos existen realmente, con sus rutas.
2. Compará con la sección 1 de este documento y **reportá cualquier discrepancia**. Si un módulo que menciono no está, o está distinto, decímelo antes de seguir.
3. Identificá exactamente: cómo se registra una tool, cómo se marca `dangerous`, cómo viaja una confirmación por SSE, y cómo se abre una conexión a SQLite.
4. Proponeme en **10 líneas** dónde encaja n8n. Esperá mi OK.

No escribas una línea de código antes de que yo apruebe ese punto 4.

---

## 4. Contrato JARVIS ↔ n8n

Un único webhook de entrada en n8n. JARVIS nunca habla con la estructura interna de n8n desde el agent loop.

**Request** (`POST {N8N_BASE_URL}/webhook/jarvis`):

```json
{
  "request_id": "uuid",
  "workflow": "daily_briefing",
  "input": {},
  "context": { "user": "federico", "timezone": "America/Argentina/Buenos_Aires" }
}
```

**Response OK:**

```json
{
  "success": true,
  "request_id": "uuid",
  "workflow": "daily_briefing",
  "status": "completed",
  "data": {},
  "message": "texto listo para que JARVIS lo lea"
}
```

**Response error:**

```json
{
  "success": false,
  "request_id": "uuid",
  "workflow": "daily_briefing",
  "status": "error",
  "error": { "code": "GMAIL_UNAVAILABLE", "message": "..." }
}
```

Reglas:
- Un workflow que falla parcialmente devuelve `success: false` con el detalle. **Nunca `success: true` si algo falló.**
- Si una integración no está configurada, el código de error lo dice explícitamente (`INTEGRATION_NOT_CONFIGURED`) y JARVIS me avisa qué falta conectar. No se inventa el dato faltante.
- Timeout de 90s del lado de JARVIS. Si vence, error `N8N_TIMEOUT`.
- El `request_id` viaja en todo el recorrido y se guarda en `tool_logs`.

---

## 5. Tools nuevas — solo tres al inicio

Archivos nuevos en `tools/`, mismo formato que las existentes:

| Tool | Firma | `dangerous` |
|---|---|---|
| `n8n_list_workflows` | `()` — lee el registry local | no |
| `n8n_run_workflow` | `(workflow, input?)` | según el registry |
| `n8n_execution_status` | `(requestId)` | no |

`n8n_run_workflow` consulta el registry: si el workflow tiene `risk: HIGH`, la tool se comporta como `dangerous` y dispara el diálogo de confirmación **que ya existe**. No construyas un sistema de permisos nuevo — el flag `dangerous` + el flujo de `confirmation_required` ya resuelven esto.

`n8n_create_workflow`, `update`, `activate`, `delete`: **fuera de alcance por ahora**. Ver sección 10.

---

## 6. Workflow registry

Tabla nueva en el SQLite existente, misma convención que el resto del schema:

```sql
CREATE TABLE n8n_workflows (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT NOT NULL,           -- DEV | ADMIN | WORLD | AUTOMATION
  risk TEXT NOT NULL,               -- LOW | MEDIUM | HIGH
  input_schema TEXT,                -- JSON schema de los inputs
  active INTEGER DEFAULT 1,
  updated_at TEXT
);
```

Se seedea al bootear desde `n8n/registry.json`, así el registry vive versionado en el repo.

El agente **necesita las descripciones en el system prompt** para saber cuándo usar un workflow. Inyectá la lista de workflows activos (nombre + descripción + inputs) junto con las memorias, en la misma sección de contexto.

---

## 7. Workflows — dos al inicio, no ocho

### 7.1 `JARVIS_HEALTH_CHECK`
Webhook → responde el envelope con `data: { n8n_version, timestamp, credentials_configured: [...] }`.

Es el que valida el contrato de punta a punta y me dice qué credenciales están cargadas. Se construye primero.

### 7.2 `JARVIS_DAILY_BRIEFING` — versión sin credenciales
Webhook → en paralelo:
- clima de Buenos Aires vía **Open-Meteo** (no requiere API key)
- tareas de hoy: n8n hace `GET {JARVIS_BASE_URL}/api/brief` contra el backend de JARVIS

→ nodo de AI que arma el resumen en español rioplatense → envelope.

**Importante:** esta versión funciona hoy, sin que yo configure nada de Google. Gmail y Calendar se agregan en la Fase 3 como nodos adicionales del mismo workflow, cada uno con manejo de error propio: si Gmail falla, el briefing sale igual con el resto y lo aclara.

El schedule diario de las 8 es un **trigger cron separado** dentro del mismo workflow, desactivado por defecto. Lo activo yo desde la UI de n8n cuando confirme que el briefing manual sale bien.

---

## 8. Validación

"JSON válido" no alcanza. Antes de darme un workflow por terminado:

1. Importalo en la instancia real de n8n vía API.
2. Ejecutalo.
3. Pegame el response HTTP real que devolvió.

Si no podés importar (n8n caído, sin API key), **decímelo** — no me lo pases como hecho.

Del lado de JARVIS: script `npm run n8n:test` que ejecuta `n8n_run_workflow('health_check')` y me muestra el envelope completo.

---

## 9. Fases

**Fase 0** — Auditoría. → Espero tu reporte y te doy el OK.

**Fase 1** — Contrato. `n8n/` en el repo, registry, tabla, las 3 tools, `JARVIS_HEALTH_CHECK` importado y corriendo.
> ✅ Le digo a JARVIS "chequeá n8n" y me devuelve la versión y las credenciales configuradas. Aparece el card de la tool en la UI.

**Fase 2** — Daily briefing sin credenciales.
> ✅ "Dame el resumen del día" → clima real + mis tareas reales de SQLite, redactado.
> ✅ Desconecto n8n a propósito → JARVIS me dice que no pudo conectarse, no inventa el resumen.

**Fase 3** — Gmail + Calendar (después de que yo cargue el OAuth).
> ✅ El briefing incluye eventos y mails. Si saco una credencial, el briefing sale igual y aclara qué falta.

**Fase 4** — Documentación y cierre.

---

## 10. Fuera de alcance

No construyas, ni siquiera parcialmente:

- **Creación de workflows por lenguaje natural** ("JARVIS, creame una automatización que..."). Es la funcionalidad más frágil de todo el diseño y la quiero recién cuando el resto sea sólido.
- WhatsApp en cualquier forma. Va por browser agent, que todavía no existe.
- Cualquier acceso de n8n a mi PC.
- Supabase.
- Los workflows `execute_tool`, `web_research`, `notification`, `scheduled_task`, `email_summary`, `calendar_summary` como archivos sueltos. Se agregan cuando el patrón esté validado.

---

## 11. Al terminar, decime

1. Archivos creados, con rutas.
2. Cómo importo los workflows.
3. Qué credenciales cargo y dónde.
4. Qué variables de entorno nuevas hay (`N8N_BASE_URL`, `N8N_API_KEY`, `JARVIS_BASE_URL`) — agregadas al `.env.example`.
5. Qué probaste vos y con qué output real.
6. Qué quedó sin probar y por qué.
7. Cómo agrego un workflow nuevo (los pasos exactos: JSON + entrada en `registry.json`).

Nunca hardcodees credenciales. Ni en el JSON de los workflows, ni en el código, ni en los ejemplos.
