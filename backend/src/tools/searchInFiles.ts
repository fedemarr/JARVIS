import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import ignore from 'ignore';
import { Tool } from './index';
import { resolveAllowedPath } from '../security/pathGuard';

const schema = z.object({
  query: z.string().min(1, 'Falta el argumento query.'),
  path: z.string().min(1, 'Falta el argumento path.'),
  glob: z.string().optional().default('*'),
});

const MAX_HITS = 30;
const MAX_FILE_BYTES = 500_000;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache']);

function toRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE__/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export const searchInFiles: Tool<typeof schema> = {
  name: 'search_in_files',
  description: 'Busca un texto dentro de los archivos de un directorio (respeta .gitignore). Args: query, path, glob opcional (ej: "*.ts", "*.{ts,js}").',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ query, path: dirPath, glob }) => {
    const guard = resolveAllowedPath(dirPath);
    if (!guard.ok) return guard.error;
    const root = guard.absolute;
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      return `No existe o no es directorio: ${root}`;
    }

    let ig = ignore();
    let current = root;
    for (let i = 0; i < 6; i++) {
      const gp = path.join(current, '.gitignore');
      if (fs.existsSync(gp)) ig.add(fs.readFileSync(gp, 'utf8'));
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    const pattern = toRegExp(glob);
    const needle = query.toLowerCase();
    const hits: string[] = [];

    const walk = (abs: string, rel: string) => {
      if (hits.length >= MAX_HITS) return;
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(abs);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (hits.length >= MAX_HITS) return;
        const entryAbs = path.join(abs, entry);
        const relPath = rel ? path.join(rel, entry) : entry;
        if (ig.ignores(relPath)) continue;
        let stat;
        try {
          stat = fs.statSync(entryAbs);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          if (SKIP_DIRS.has(entry)) continue;
          walk(entryAbs, relPath);
        } else if (stat.isFile() && pattern.test(entry) && stat.size <= MAX_FILE_BYTES) {
          try {
            const content = fs.readFileSync(entryAbs, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length && hits.length < MAX_HITS; i++) {
              if (lines[i].toLowerCase().includes(needle)) {
                hits.push(`${relPath}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
              }
            }
          } catch {
            // skip unreadable binary files
          }
        }
      }
    };

    walk(root, '');
    if (hits.length === 0) return `Sin resultados para "${query}" en ${root}`;
    return hits.join('\n') + (hits.length >= MAX_HITS ? `\n… (límite ${MAX_HITS} coincidencias)` : '');
  },
};
