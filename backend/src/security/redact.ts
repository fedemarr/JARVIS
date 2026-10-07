const SENSITIVE_KEY = /\b(key|token|secret|password|authorization|api[_-]?key|passwd)\b/i;

export function redactString(text: string): string {
  return text.replace(
    /(api[_-]?key|authorization|token|secret|password|passwd)\s*[=:]\s*["']?[^\s"',;}]+/gi,
    (match, label) => `${label}=***redactado***`,
  );
}

export function redactArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '***redactado***';
    } else if (typeof value === 'string') {
      out[key] = redactString(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function summarize(content: string, max = 200): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}
