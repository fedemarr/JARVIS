import { z } from 'zod';
import { exec } from 'child_process';
import fs from 'fs';
import { Tool } from './index';
import { ProjectRepository } from '../memory/repositories/projectRepository';
import { resolveAllowedPath } from '../security/pathGuard';

const schema = z.object({
  project: z.string().min(1, 'Falta el argumento project (nombre de un proyecto registrado o ruta).'),
});

function resolveProjectPath(input: string): { ok: true; path: string; label: string } | { ok: false; error: string } {
  const repo = new ProjectRepository();
  const byName = repo.findByName(input);
  if (byName) {
    if (!fs.existsSync(byName.path)) return { ok: false, error: `La ruta del proyecto "${byName.name}" no existe: ${byName.path}` };
    return { ok: true, path: byName.path, label: byName.name };
  }
  const guard = resolveAllowedPath(input);
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!fs.existsSync(guard.absolute)) return { ok: false, error: `No existe el directorio: ${guard.absolute}` };
  return { ok: true, path: guard.absolute, label: input };
}

export function getProjectOrPath(
  input: string,
): { ok: true; path: string; label: string } | { ok: false; error: string } {
  return resolveProjectPath(input);
}

export const gitStatus: Tool<typeof schema> = {
  name: 'git_status',
  description:
    'Muestra el estado de git (git status) de un proyecto registrado o una ruta permitida. Args: project (nombre de proyecto o ruta).',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: (args) =>
    new Promise<string>((resolve) => {
      const { project } = args as { project: string };
      const resolved = resolveProjectPath(project);
      if (!resolved.ok) {
        resolve(resolved.error);
        return;
      }
      exec(
        'git status --short --branch',
        { cwd: resolved.path, timeout: 30_000, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            const msg = (error as any).message || String(error);
            if (/not a git repository/i.test(msg)) {
              resolve(`${resolved.label}: no es un repositorio git (${resolved.path}).`);
            } else {
              resolve(`Error ejecutando git status: ${msg}`);
            }
            return;
          }
          const out = ((stdout || '') + (stderr || '')).trim();
          resolve(`git status de ${resolved.label}:\n${out || '(working tree limpio)'}`);
        },
      );
    }),
};
