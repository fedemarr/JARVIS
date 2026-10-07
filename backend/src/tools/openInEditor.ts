import { z } from 'zod';
import { exec } from 'child_process';
import { Tool } from './index';
import { getProjectOrPath } from './gitStatus';

const schema = z.object({
  project: z.string().min(1, 'Falta el argumento project (nombre de un proyecto registrado o ruta).'),
});

export const openInEditor: Tool<typeof schema> = {
  name: 'open_in_editor',
  description: 'Abre un proyecto registrado (o una ruta permitida) en VS Code (code <ruta>). Args: project.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: (args) =>
    new Promise<string>((resolve) => {
      const { project } = args as { project: string };
      const resolved = getProjectOrPath(project);
      if (!resolved.ok) {
        resolve(resolved.error);
        return;
      }
      exec(
        `code "${resolved.path.replace(/"/g, '\\"')}"`,
        { timeout: 30_000, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            resolve(`Error al abrir VS Code: ${(error as any).message || String(error)}`);
            return;
          }
          const out = ((stdout || '') + (stderr || '')).trim();
          resolve(out ? `VS Code: ${out}` : `Abrí ${resolved.label} en VS Code.`);
        },
      );
    }),
};
