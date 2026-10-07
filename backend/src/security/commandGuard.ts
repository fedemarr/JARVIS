const ALLOWED_BINARIES = ['npm', 'npx', 'node', 'git', 'python', 'pnpm', 'code', 'dir', 'tsc', 'ls', 'cargo'];

const DESTRUCTIVE_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /(^|\s)(rm|del|rmdir|rm -rf|rd\b|format|shutdown)(\s|$)/i, reason: 'comando destructivo' },
  { pattern: /git\s+reset\s+--hard/i, reason: 'git reset --hard' },
  { pattern: /git\s+push\s+--force/i, reason: 'git push --force' },
  { pattern: /git\s+clean/i, reason: 'git clean' },
  { pattern: /npm\s+publish/i, reason: 'npm publish' },
  { pattern: /(^|\s)(>|>>|\||2>|\btar\b\s+-|curl[^|]*\|\s*sh\b)/i, reason: 'redirección o pipe destructivo' },
  { pattern: /(^|\s)(dd|mkfs\.|fdisk|parted|killall|pkill)(\s|$)/i, reason: 'comando destructivo' },
  { pattern: /--force\b/i, reason: 'fuerza (--force)' },
];

export type CommandGuardResult =
  | { dangerous: false }
  | { dangerous: true; reason: string };

export function checkCommand(command: string): CommandGuardResult {
  if (!command || typeof command !== 'string') {
    return { dangerous: true, reason: 'comando vacío' };
  }

  const firstToken = command.trim().split(/\s+/)[0]?.toLowerCase();
  const bare = firstToken?.replace(/['"`]/g, '');
  if (bare && !ALLOWED_BINARIES.includes(bare)) {
    return { dangerous: true, reason: `binario no permitido: ${firstToken}` };
  }

  for (const { pattern, reason } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, reason };
    }
  }

  return { dangerous: false };
}
