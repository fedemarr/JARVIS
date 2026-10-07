import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

const run = promisify(execFile);
export const desktopConfigSchema = z.object({
  projects: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), name: z.string().min(1).max(80), root: z.string().min(1) })).min(1).max(10),
}).strict();
export type DesktopConfig = z.infer<typeof desktopConfigSchema>;
const excluded = /^(?:\.env(?:\..*)?|\.git|\.ssh|\.aws|\.vercel|\.agents|node_modules|data|dist|build|coverage|artifacts|n8n_data|voice-venv|credentials.*|secrets?.*|id_rsa.*|id_ed25519.*)$|\.(?:pem|key|pfx|p12|db|sqlite|log)$/i;
const extensions = new Set(['.md','.html','.htm','.txt','.json','.ts','.tsx','.js','.jsx','.css','.scss','.sql','.py','.yml','.yaml','.vue','.prisma','.xml','.csv']);
const sensitive = /sk-ant-[a-zA-Z0-9_-]+|sk-[a-zA-Z0-9_-]{20,}|(?:postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s"']+|-----BEGIN [^-]*PRIVATE KEY-----/i;

export class ReadOnlyProjects {
  constructor(private config: DesktopConfig) {}
  list() { return this.config.projects.map(({id,name}) => ({id,name})); }
  private async resolve(id: string, relative = '.') {
    const project = this.config.projects.find((p) => p.id === id);
    if (!project) throw new Error('Proyecto no autorizado.');
    if (path.isAbsolute(relative) || relative.includes(':') || relative.includes('\0') || relative.split(/[\\/]/).some((part) => part === '..' || excluded.test(part))) throw new Error('Ruta no permitida.');
    const root = await fs.realpath(project.root);
    const candidate = await fs.realpath(path.resolve(root, relative));
    const within = path.relative(root, candidate);
    if (within.startsWith('..') || path.isAbsolute(within) || within.split(/[\\/]/).some((part) => excluded.test(part))) throw new Error('Ruta fuera del proyecto o privada.');
    // Nunca seguir enlaces/junctions, incluso si apuntan a otro lugar dentro del proyecto.
    let current = root;
    for (const part of path.relative(root, path.resolve(root, relative)).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Enlace no permitido.');
    }
    return candidate;
  }
  async files(id: string, relative = '.') {
    const target = await this.resolve(id, relative);
    const entries = await fs.readdir(target, {withFileTypes:true});
    return entries.filter((e) => !e.isSymbolicLink() && !excluded.test(e.name) && (e.isDirectory() || extensions.has(path.extname(e.name).toLowerCase())))
      .sort((a,b) => Number(b.isDirectory())-Number(a.isDirectory()) || a.name.localeCompare(b.name)).slice(0,200)
      .map((e) => ({name:e.name, directory:e.isDirectory(), path:path.posix.join(relative.replace(/\\/g,'/'),e.name)}));
  }
  async read(id: string, relative: string) {
    const target = await this.resolve(id, relative);
    if (!extensions.has(path.extname(target).toLowerCase())) throw new Error('Tipo de archivo no permitido.');
    const file = await fs.open(target, 'r');
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 64000) throw new Error('Elegí un archivo de texto de hasta 64 KB.');
      const buffer = Buffer.alloc(64001);
      const {bytesRead} = await file.read(buffer,0,buffer.length,0);
      if (bytesRead > 64000 || buffer.subarray(0,bytesRead).includes(0)) throw new Error('Archivo demasiado grande o binario.');
      const text = buffer.subarray(0,bytesRead).toString('utf8');
      if (sensitive.test(text) || /(?:api[_-]?key|password|secret|token)\s*[=:]\s*["']?[^\s"']{16,}/i.test(text)) throw new Error('El archivo parece contener credenciales; lectura bloqueada.');
      return {project:id, path:relative, text, observedAt:new Date().toISOString()};
    } finally { await file.close(); }
  }
  async git(id: string) {
    const cwd = await this.resolve(id);
    // Argumentos fijos, sin shell ni comandos configurables. No ejecutar fsmonitor del repo.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    env.GIT_OPTIONAL_LOCKS = '0';
    const options = {cwd,env,windowsHide:true,timeout:10000,maxBuffer:64000};
    const args = ['-c','core.fsmonitor=false','-c','core.untrackedCache=false'];
    const {stdout:top} = await run('git',[...args,'rev-parse','--show-toplevel'],options);
    if (await fs.realpath(top.trim()) !== cwd) throw new Error('La carpeta autorizada debe ser la raíz del repositorio.');
    const [{stdout:branch},{stdout:status}] = await Promise.all([
      run('git',[...args,'branch','--show-current'],options),
      run('git',[...args,'status','--porcelain=v1','--untracked-files=normal'],options),
    ]);
    const changes = status.split(/\r?\n/).filter(Boolean).filter((line) => !line.slice(3).split(/[\\/]/).some((part) => excluded.test(part))).slice(0,100);
    return {project:id,branch:branch.trim(),changes,observedAt:new Date().toISOString(),mode:'read-only'};
  }
}
