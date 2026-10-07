import { z } from 'zod';
import { exec } from 'child_process';
import { Tool } from './index';
import { checkCommand } from '../security/commandGuard';
import { resolveAllowedPath } from '../security/pathGuard';

const schema = z.object({
  command: z.string().min(1, 'Falta el argumento command.'),
  cwd: z.string().optional(),
});

const TIMEOUT_MS = 60_000;
const MAX_OUTPUT = 20_000;

export const executeCommand: Tool<typeof schema> = {
  name: 'execute_command',
  description:
    'Ejecuta un comando en la terminal (allowlist: npm, npx, node, git, python, pnpm, code, dir, ls, tsc, cargo). Args: command, cwd opcional (debe estar en los directorios permitidos). Comandos destructivos requieren confirmación. Timeout 60s.',
  schema,
  dangerous: false,
  dangerReason: (args) => {
    const command = String(args?.command ?? '');
    const result = checkCommand(command);
    return result.dangerous ? result.reason : null;
  },
  handler: ({ command, cwd }) => {
    let resolvedCwd: string | undefined;
    if (cwd) {
      const guard = resolveAllowedPath(cwd);
      if (!guard.ok) return guard.error;
      if (!require('fs').existsSync(guard.absolute)) return `No existe el directorio: ${guard.absolute}`;
      resolvedCwd = guard.absolute;
    }

    const guard = checkCommand(command);
    if (guard.dangerous) {
      return `Comando bloqueado (${guard.reason}).`;
    }

    return new Promise<string>((resolve) => {
      exec(
        command,
        { cwd: resolvedCwd, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT * 2, windowsHide: true },
        (error, stdout, stderr) => {
          const out = (stdout || '') + (stderr || '');
          const truncated = out.length > MAX_OUTPUT ? out.slice(0, MAX_OUTPUT) + '\n… [output truncado]' : out;
          if (error) {
            const timedOut = (error as any).killed === true || /timed? ?out/i.test(String(error.message));
            const message = timedOut ? `Timeout: el comando superó ${TIMEOUT_MS / 1000}s.` : `Exit code ${error.code ?? '?'}.`;
            resolve(`${message}\n${truncated}`.trim());
          } else {
            resolve(truncated.trim() || '(sin output)');
          }
        },
      );
    });
  },
};
