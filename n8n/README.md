# n8n — ejecutor desatendido de JARVIS

## Levantar

```bash
cd n8n
docker compose up -d
```

- URL: http://localhost:5678
- Datos persisten en `./n8n_data/` (creado al primer arranque).
- Usar Docker Desktop (Windows/Mac); en Linux el `extra_hosts` ya mapea
  `host.docker.internal` al host.

## API key

n8n → **Settings → API**, generar la clave y ponerla en el `.env` del repo:

```
N8N_API_KEY=tu-clave-generada
```

La usa JARVIS para `n8n_list_workflows`, `n8n_run_workflow` y
`n8n_execution_status` (y los scripts de import vía API).

## Importar los workflows

En n8n (UI): **Workflows → Add workflow → (⋮) → Import from File**,
importar cada archivo de `n8n/workflows/`:

1. `jarvis_health_check.json` → webhook `POST /webhook/jarvis`
2. `jarvis_daily_briefing.json` → webhook `POST /webhook/jarvis_daily_briefing`

Luego activar cada workflow (toggle en la esquina superior derecha).

> Importante: un workflow con nodos de Google (Gmail/Calendar) **no se puede
> activar** hasta que la credencial OAuth esté cargada. n8n lo rechaza con
> `Missing required credential`. Primero cargá la credencial (ver abajo).

## Conexión contenedor → host (IMPORTANTE)

n8n corre en Docker; JARVIS corre en el host. **Dentro del contenedor,
`localhost:3001` NO es el backend.** Para que los workflows lleguen a JARVIS
usar:

```
http://host.docker.internal:3001
```

- El `daily_briefing` ya usa `{{ $env.JARVIS_BASE_URL }}/api/brief`, y
  `JARVIS_BASE_URL=http://host.docker.internal:3001` está en el `.env`.
- Requiere `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` en el `docker-compose.yml`
  (ya está), para que los nodos Code puedan leer `$env.JARVIS_BASE_URL`.

## Credenciales de Google (Fase 3 — Gmail, Calendar, Meet)

Requisito: un proyecto en Google Cloud con OAuth habilitado. Es gratis (no
necesita tarjeta). Pasos:

1. Ir a https://console.cloud.google.com → crear un proyecto (o usar uno).
2. Habilitar las APIs **Gmail API** y **Google Calendar API**
   (APIs & Services → Library).
3. **OAuth consent screen** → External → completar nombre de app y mail.
4. **Credentials → Create credentials → OAuth client ID** → tipo **Desktop app**
   → copiar el Client ID y el Client Secret.
5. En n8n: **Settings → Credentials → Add credential → Google OAuth2 API**:
   pegar Client ID / Secret, scope agregado:
   `https://www.googleapis.com/auth/calendar.readonly`
   `https://www.googleapis.com/auth/gmail.readonly`
   y completar el flujo **Sign in with Google** en la ventana que abre.
6. Recién después, activar los workflows de Calendar/Gmail.

Los client IDs de Google **nunca van al `.env` de JARVIS**: viven solo dentro
de n8n (en `n8n_data/`).

## Verificar el contrato

Con n8n corriendo y los workflows activos:

```bash
npm run n8n:test
```

Valida: registry → DB seed → `GET /api/brief` → `POST /webhook/jarvis` →
envelope intacto → `N8N_API_KEY` presente.

## Registry

`n8n/registry.json` es la fuente de verdad de qué workflows conoce JARVIS.
Los cambios ahí se aplican al reiniciar el backend (seed a la tabla
`n8n_workflows`).

## Cómo agregar un workflow nuevo

1. Crear el workflow en la UI de n8n (o copiar un JSON existente), exportarlo
   como JSON y guardarlo en `n8n/workflows/<nombre>.json`.
2. Importarlo y activarlo en n8n (ver arriba).
3. Agregar una entrada en `n8n/registry.json` con: `name` (cómo lo llama
   JARVIS), `n8n_workflow` (nombre en n8n), `webhook_path`, `description`,
   `category`, `risk` (LOW/MEDIUM/HIGH → HIGH pide confirmación en la UI) e
   `input_schema`.
4. Reiniciar el backend para que el seed tome el nuevo registry.
5. Probar con `npm run n8n:test` (si es el contrato) o pidiéndole a JARVIS
   que ejecute el workflow.

## Qué se probó (real, no mock)

- Import + activación vía API de `health_check` y `daily_briefing`.
- `npm run n8n:test` → 7/7 checks OK, exit 0.
- `POST /webhook/jarvis_daily_briefing` → HTTP 200 con clima real
  (Open-Meteo) + tareas reales de SQLite de JARVIS, texto listo para leer.

## Qué quedó sin probar y por qué

- **Gmail + Calendar + Meet en el briefing**: requiere el OAuth de Google
  cargado en n8n (pasos de arriba). Sin la credencial, n8n no permite
  activar un workflow con esos nodos, así que no se puede validar.
- **Schedule diario (cron) del briefing**: trigger desactivado por diseño;
  se activa desde la UI cuando el briefing manual esté confirmado.
- **WhatsApp**: fuera de alcance (ver `JARVIS_N8N_PROMPT.md` §10).
