import { z } from 'zod';
import { Tool } from './index';
import { internetSearch } from '../internet/tools';

const schema = z.object({
  query: z.string().trim().min(2, 'Falta el argumento query.').max(300),
});

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}

export const webSearch: Tool<typeof schema> = {
  name: 'web_search',
  description: 'Busca información actualizada en internet; devuelve fuentes y fragmentos. Args: query.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: async ({ query }) => {
    const apiKey = process.env.SEARCH_API_KEY;
    if (!apiKey) {
      return internetSearch.handler({query});
    }
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        return `Error de Tavily: HTTP ${response.status} ${response.statusText}`;
      }
      const data = (await response.json()) as { results?: TavilyResult[] };
      const results = data.results || [];
      if (results.length === 0) return 'Sin resultados.';
      return results
        .map((r, i) => `${i + 1}. ${r.title ?? '(sin título)'}\n   ${r.url}\n   ${r.content ?? ''}`)
        .join('\n\n');
    } catch (err: any) {
      return `Error al buscar: ${err?.message || String(err)}`;
    }
  },
};
