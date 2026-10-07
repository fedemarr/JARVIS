import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { Tool } from './index';
import { resolveAllowedPath } from '../security/pathGuard';

const schema = z.object({
  path: z.string().min(1, 'Falta el argumento path.'),
  content: z.string(),
});

export const writeFile: Tool<typeof schema> = {
  name: 'write_file',
  description: 'Escribe (o sobrescribe) un archivo de texto. Args: path, content.',
  schema,
  dangerous: true,
  dangerReason: () => 'write_file modifica el sistema de archivos y siempre requiere confirmación.',
  handler: ({ path: filePath, content }) => {
    const guard = resolveAllowedPath(filePath);
    if (!guard.ok) return guard.error;
    const abs = guard.absolute;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    return `Archivo escrito (${content.length} caracteres): ${abs}`;
  },
};
