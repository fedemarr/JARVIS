import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../config';
import { desktopConfigSchema } from './projects';
import { buildDesktopApp } from './app';

async function main() {
  const root=projectRoot();
  // Configuración y clave de esta PC: nunca se incluyen en Git ni en Vercel.
  const config=desktopConfigSchema.parse(JSON.parse(fs.readFileSync(path.join(root,'data','desktop-projects.json'),'utf8')));
  process.env.JARVIS_ACCESS_KEY=fs.readFileSync(path.join(root,'data','jarvis-access-key.txt'),'utf8').trim();
  process.env.JARVIS_MODE='desktop'; process.env.NODE_ENV='development'; process.env.HOST='127.0.0.1';
  process.env.ALLOWED_ORIGINS='https://jarvis-eta-blue.vercel.app,http://127.0.0.1:3002,http://localhost:3002';
  const app=buildDesktopApp(config,root);
  await app.listen({host:'127.0.0.1',port:3002});
  console.log('Conector local de Jarvis listo en 127.0.0.1:3002: lectura, voz y tickets en el proyecto original.');
  for(const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,async()=>{await app.close();});
}
main().catch(()=>{console.error('No se pudo iniciar Jarvis Desktop. Revisá data/desktop-projects.json y el puerto 3002.');process.exitCode=1;});
