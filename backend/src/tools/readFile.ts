import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { Tool } from './index';
import { resolveAllowedPath } from '../security/pathGuard';

const schema = z.object({
  path: z.string().min(1, 'Falta el argumento path.'),
  maxBytes: z.number().int().positive().max(5_000_000).optional().default(100000),
});

export const readFile: Tool<typeof schema> = {
  name: 'read_file',
  description: 'Lee el contenido de un archivo de texto dentro de los directorios permitidos. Args: path, maxBytes opcional (default 100000).',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ path: filePath, maxBytes }) => {
    const guard = resolveAllowedPath(filePath);
    if (!guard.ok) return guard.error;
    const abs = guard.absolute;
    if (!fs.existsSync(abs)) return `No existe: ${abs}`;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) return `${abs} es un directorio. Usá list_directory.`;
    const size = stat.size;
    if (size > maxBytes) {
      return `El archivo tiene ${size} bytes (máximo ${maxBytes}). Leé solo una parte o usá search_in_files.`;
    }
    const content = fs.readFileSync(abs, 'utf8');
    return content;
  },
};
