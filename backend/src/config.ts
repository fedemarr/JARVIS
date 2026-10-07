import path from 'path';
import fs from 'fs';

export function projectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (Array.isArray(pkg.workspaces)) {
          return dir;
        }
      } catch {
        // keep walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(__dirname, '..', '..');
}

export function envPath(): string {
  return path.join(projectRoot(), '.env');
}
