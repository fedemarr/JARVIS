import { z } from 'zod';
import { exec } from 'child_process';
import { Tool } from './index';
import { getProjectOrPath } from './gitStatus';
import { checkCommand } from '../security/commandGuard';

const schema = z.object({
  project: z.string().min(1, 'Falta el argumento project (nombre de un proyecto registrado o ruta).'),
  command: z.string().min(1, 'Falta el argumento command.').optional(),
});

export const runProject: Tool<typeof schema> = {
  name: 'run_project',
  description:
    'Levanta el entorno de dev de un proyecto en una terminal nueva (por defecto: npm run dev; podés pasar otro command). Args: project (nombre o ruta), command opcional.',
  schema,
  dangerous: false,
  dangerReason: (args) => {
    const command = String(args?.command ?? 'npm run dev');
    const result = checkCommand(command);
    return result.dangerous ? result.reason : null;
  },
  handler: (args) =>
    new Promise<string>((resolve) => {
      const { project, command } = args as { project: string; command?: string };
      const resolved = getProjectOrPath(project);
      if (!resolved.ok) {
        resolve(resolved.error);
        return;
      }
      const runCmd = command || 'npm run dev';
      const guard = checkCommand(runCmd);
      if (guard.dangerous) {
        resolve(`Comando bloqueado (${guard.reason}).`);
        return;
      }
      exec(
        `start "JARVIS - ${resolved.label}" cmd /k "cd /d ${resolved.path} && ${runCmd}"`,
        { timeout: 30_000, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            resolve(`Error al levantar el proyecto: ${(error as any).message || String(error)}`);
            return;
          }
          const out = ((stdout || '') + (stderr || '')).trim();
          resolve(out ? `Proyecto: ${out}` : `Levanté ${resolved.label} en una terminal nueva (${runCmd}).`);
        },
      );
    }),
};
