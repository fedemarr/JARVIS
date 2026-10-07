import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Readable } from 'node:stream';
import path from 'node:path';
import { z } from 'zod';
import { registerAuth } from '../security/auth';
import { ReadOnlyProjects, DesktopConfig } from './projects';
import { LocalVoice } from './voice';

const query = z.object({project:z.string().min(1).max(40),path:z.string().max(500).default('.')}).strict();
export function buildDesktopApp(config:DesktopConfig,root:string,cloud='https://jarvis-eta-blue.vercel.app') {
  if (new URL(cloud).origin !== 'https://jarvis-eta-blue.vercel.app') throw new Error('Servidor remoto no autorizado.');
  if (!process.env.JARVIS_ACCESS_KEY) throw new Error('Falta la clave privada de acceso local.');
  const app = Fastify({bodyLimit:128*1024,logger:{redact:['req.headers.cookie','req.headers.authorization']}});
  const projects = new ReadOnlyProjects(config);
  const voice = new LocalVoice(root);
  let cloudSession:Promise<string>|undefined;
  registerAuth(app);
  app.addHook('onRequest',async(request,reply) => {
    // Evitar DNS rebinding: ningún dominio remoto puede apuntar a este servicio local.
    if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(request.headers.host || '')) return reply.code(403).send({message:'Host no permitido.'});
  });
  app.addHook('onSend',async(_request,reply,payload) => {reply.header('Cache-Control','no-store'); return payload;});
  app.setErrorHandler((error,_request,reply) => reply.code(400).send({message:error instanceof z.ZodError ? 'Revisá los datos enviados.' : 'No se pudo completar la lectura o la conexión.'}));
  app.get('/api/desktop/status',async() => ({mode:'read-only',local:true,projects:projects.list(),voice:voice.status()}));
  app.get('/api/desktop/files',async(request) => { const args=query.parse(request.query); return projects.files(args.project,args.path); });
  app.get('/api/desktop/read',async(request) => { const args=query.parse(request.query); return projects.read(args.project,args.path); });
  app.get('/api/desktop/git',async(request) => { const args=query.parse(request.query); return projects.git(args.project); });
  app.get('/api/voice/status',async() => voice.status());
  app.post('/api/voice/synthesize',async(request,reply) => {
    const {text} = z.object({text:z.string().trim().min(1).max(220)}).strict().parse(request.body);
    if (!voice.status().available || voice.status().busy) return reply.code(503).send({message:'Voz local no disponible; usá la voz del navegador.'});
    return reply.type('audio/wav').send(await voice.synthesize(text));
  });
  async function session() {
    cloudSession ??= (async() => {
      const response=await fetch(cloud+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessKey:process.env.JARVIS_ACCESS_KEY}),signal:AbortSignal.timeout(15000),redirect:'error'});
      if (!response.ok) throw new Error('No se pudo autenticar con Jarvis.');
      const cookie=response.headers.get('set-cookie')?.split(';')[0];
      if (!cookie) throw new Error('Falta la sesión remota.');
      return cookie;
    })().catch((error)=>{cloudSession=undefined;throw error;});
    return cloudSession;
  }
  // Lista cerrada: este servicio no expone terminal, escritura, confirmaciones ni proxy libre.
  app.route({method:['GET','POST'],url:'/api/*',handler:async(request,reply) => {
    const url=request.url;
    const allowed = request.method === 'GET' ? /^\/api\/(?:health|brief|conversations(?:\/[a-f0-9-]{36})?)$/ : /^\/api\/chat$/;
    if (!allowed.test(url)) return reply.code(404).send({message:'Operación no disponible en el agente de lectura.'});
    const controller=new AbortController();
    const disconnect=()=>controller.abort();
    reply.raw.once('close',disconnect);
    const timeout=setTimeout(()=>controller.abort(),165000);
    try {
      const cookie=await session();
      const response=await fetch(cloud+url,{method:request.method,headers:{Cookie:cookie,...(request.method==='POST'?{'Content-Type':'application/json'}:{})},body:request.method==='POST'?JSON.stringify(request.body):undefined,signal:controller.signal,redirect:'error'});
      if(response.status===401) cloudSession=undefined;
      reply.code(response.status).header('Content-Type',response.headers.get('Content-Type') || 'application/json');
      if (!response.body) { clearTimeout(timeout); reply.raw.removeListener('close',disconnect); return reply.send(); }
      const stream=Readable.fromWeb(response.body as any);
      const cleanup=()=>{clearTimeout(timeout);reply.raw.removeListener('close',disconnect);};
      stream.once('end',cleanup);stream.once('error',cleanup);stream.once('close',cleanup);
      return reply.send(stream);
    } catch { clearTimeout(timeout);reply.raw.removeListener('close',disconnect);return reply.code(503).send({message:'No pude conectar con Jarvis en la nube. Volvé a intentarlo.'}); }
  }});
  app.register(fastifyStatic,{root:path.join(root,'frontend','dist'),prefix:'/'});
  app.setNotFoundHandler((request,reply) => request.url.startsWith('/api/') ? reply.code(404).send({message:'Operación no disponible.'}) : reply.sendFile('index.html'));
  app.addHook('onReady',async()=>voice.start());
  app.addHook('onClose',async()=>voice.close());
  return app;
}
