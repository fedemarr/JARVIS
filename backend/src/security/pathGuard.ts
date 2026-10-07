import path from 'path';
import fs from 'fs';
import os from 'os';
import { projectRoot } from '../config';

const SENSITIVE_FILE = /(\.env(\.\w+)?$|\.pem$|\.key$|^id_rsa|\.p12$|\.pfx$|\.kdbx$)/i;

export type PathGuardResult =
  | { ok: true; absolute: string }
  | { ok: false; error: string };

export function getAllowedDirs(): string[] {
  const raw = process.env.ALLOWED_DIRS || '';
  const dirs = raw
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => path.resolve(d));
  return dirs.length > 0 ? dirs : [projectRoot()];
}

function normalized(p: string): string {
  return p.replace(/\/+$/, '');
}

export function resolveAllowedPath(inputPath: string): PathGuardResult {
  if (!inputPath || typeof inputPath !== 'string') {
    return { ok: false, error: 'La ruta no puede estar vacía.' };
  }
  if (inputPath.includes('\0')) {
    return { ok: false, error: 'Ruta inválida.' };
  }

  const absolute = path.resolve(inputPath);
  const allowed = getAllowedDirs();

  let realBase = absolute;
  try {
    const parent = path.dirname(absolute);
    realBase = path.join(fs.realpathSync(parent), path.basename(absolute));
  } catch {
    // parent may not exist yet (e.g. write_file to a new path); fall back to lexical
    let probe = absolute;
    const missing: string[] = [];
    while (!fs.existsSync(probe)) {
      missing.push(path.basename(probe));
      const next = path.dirname(probe);
      if (next === probe) break;
      probe = next;
    }
    try {
      realBase = path.join(fs.realpathSync(probe), ...missing.reverse());
    } catch {
      return { ok: false, error: 'No se puede resolver la ruta real.' };
    }
  }

  const normalizedBase = normalized(realBase);
  const inside = allowed.some((dir) => {
    const d = normalized(path.resolve(dir));
    return normalizedBase === d || normalizedBase.startsWith(d + path.sep) || normalizedBase.startsWith(d + '/');
  });
  if (!inside) {
    return {
      ok: false,
      error: `Acceso denegado: la ruta está fuera de los directorios permitidos (${allowed.join(', ')}).`,
    };
  }

  const baseName = path.basename(realBase);
  if (SENSITIVE_FILE.test(baseName) || SENSITIVE_FILE.test(realBase)) {
    return { ok: false, error: 'Acceso denegado: archivo sensible no permitido.' };
  }

  return { ok: true, absolute: realBase };
}

export function homeDir(): string {
  return os.homedir();
}
