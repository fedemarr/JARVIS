export interface N8nEnvelope {
  action: string;
  workflow: string;
  input: Record<string, unknown>;
  request_id: string;
}

export interface N8nRunOptions {
  baseUrl: string;
  apiKey?: string;
  webhookPath: string;
  envelope: N8nEnvelope;
  timeoutMs?: number;
}

export interface N8nRunResult {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 90_000;

export function n8nBaseUrl(): string {
  return process.env.N8N_BASE_URL || 'http://localhost:5678';
}

export function n8nApiKey(): string | undefined {
  const key = process.env.N8N_API_KEY?.trim();
  return key || undefined;
}

export async function runN8nWorkflow(opts: N8nRunOptions): Promise<N8nRunResult> {
  const { baseUrl, apiKey, webhookPath, envelope, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const path = webhookPath.replace(/^\//, '');
  const url = `${baseUrl.replace(/\/$/, '')}/webhook/${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-N8N-API-KEY': apiKey } : {}),
      },
      body: JSON.stringify({ json: envelope }),
      signal: controller.signal,
    });

    const text = await response.text();
    let data: unknown = text;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // keep raw text if not JSON
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
