import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import ignore from 'ignore';
import { Tool } from './index';
import { resolveAllowedPath } from '../security/pathGuard';

const schema = z.object({
  path: z.string().min(1, 'Falta el argumento path.'),
  depth: z.number().int().min(0).max(6).optional().default(2),
});

const MAX_ENTRIES = 200;

function loadIgnores(dir: string) {
  const ig = ignore();
  let current = dir;
  for (let i = 0; i < 6; i++) {
    const gitignorePath = path.join(current, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      ig.add(fs.readFileSync(gitignorePath, 'utf8'));
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return ig;
}

export const listDirectory: Tool<typeof schema> = {
  name: 'list_directory',
  description: 'Lista el contenido de un directorio como árbol (respeta .gitignore). Args: path, depth opcional (0-6, default 2).',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ path: dirPath, depth }) => {
    const guard = resolveAllowedPath(dirPath);
    if (!guard.ok) return guard.error;
    const root = guard.absolute;
    if (!fs.existsSync(root)) return `No existe: ${root}`;
    const stat = fs.statSync(root);
    if (!stat.isDirectory()) return `${root} no es un directorio.`;

    const ig = loadIgnores(root);
    const lines: string[] = [];
    let count = 0;

    const walk = (abs: string, rel: string, level: number) => {
      if (count >= MAX_ENTRIES) return;
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(abs).filter((e) => {
          const relPath = rel ? path.join(rel, e) : e;
          return !ig.ignores(relPath);
        });
      } catch {
        return;
      }
      entries.sort();
      for (const entry of entries) {
        if (count >= MAX_ENTRIES) return;
        const entryAbs = path.join(abs, entry);
        const relPath = rel ? path.join(rel, entry) : entry;
        let isDir = false;
        try {
          isDir = fs.statSync(entryAbs).isDirectory();
        } catch {
          continue;
        }
        const indent = '  '.repeat(level);
        lines.push(`${indent}${isDir ? '📁' : '  '} ${entry}${isDir ? '/' : ''}`);
        count++;
        if (isDir && level < depth) {
          walk(entryAbs, relPath, level + 1);
        }
      }
    };

    lines.push(root + '/');
    walk(root, '', 1);
    if (count >= MAX_ENTRIES) lines.push(`… (límite de ${MAX_ENTRIES} entradas)`);
    return lines.join('\n');
  },
};
