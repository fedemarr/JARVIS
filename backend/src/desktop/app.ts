import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import { Readable } from 'node:stream';
import path from 'node:path';
import { z } from 'zod';
import { registerAuth } from '../security/auth';
import { ReadOnlyProjects, DesktopConfig } from './projects';
import { LocalVoice } from './voice';
import { BRIDGE_ORIGIN, validBridgeToken } from '../security/bridge';
import { TicketRunner } from './tickets';

const query = z.object({project:z.string().min(1).max(40),path:z.string().max(500).default('.')}).strict();
export function buildDesktopApp(config:DesktopConfig,root:string,cloud='https://jarvis-eta-blue.vercel.app') {
  if (new URL(cloud).origin !== 'https://jarvis-eta-blue.vercel.app') throw new Error('Servidor remoto no autorizado.');
  if (!process.env.JARVIS_ACCESS_KEY) throw new Error('Falta la clave privada de acceso local.');
  const app = Fastify({bodyLimit:128*1024,logger:{redact:['req.headers.cookie','req.headers.authorization']}});
  const projects = new ReadOnlyProjects(config);
  const voice = new LocalVoice(root);
  const tickets = new TicketRunner(config,root);
  let cloudSession:Promise<string>|undefined;
  registerAuth(app,{bridgeAuthorized:(request)=>{
    const url=request.url.split('?')[0];
    if(/^\/api\/bridge\/tickets(?:\/status|\/[a-f0-9-]{36}\/(?:cancel|open))?$/.test(url)) {
      const allowed=request.method==='GET'?/^\/api\/bridge\/tickets(?:\/status)?$/.test(url):request.method==='POST' && (url==='/api/bridge/tickets' || /\/(?:cancel|open)$/.test(url));
      return allowed && request.headers.origin===BRIDGE_ORIGIN && validBridgeToken((request.headers.authorization || '').replace(/^Bearer /,''),process.env.JARVIS_ACCESS_KEY!,Date.now(),'tickets');
    }
    const allowed=request.method==='GET'?/^\/api\/bridge\/(?:desktop\/(?:status|files|read|git)|voice\/status)$/:request.method==='POST' && url==='/api/bridge/voice/synthesize';
    return !!allowed && request.headers.origin===BRIDGE_ORIGIN && validBridgeToken((request.headers.authorization || '').replace(/^Bearer /,''),process.env.JARVIS_ACCESS_KEY!);
  }});
  app.register(cors,{origin:[BRIDGE_ORIGIN,'http://127.0.0.1:3002','http://localhost:3002'],methods:['GET','POST','OPTIONS'],allowedHeaders:['Authorization','Content-Type']});
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
  for(const prefix of ['/api/tickets','/api/bridge/tickets']) {
    app.get(prefix+'/status',async()=>tickets.status());
    app.get(prefix,async()=>tickets.list());
    app.post(prefix,async(request,reply)=>{
      try {return reply.code(202).send(await tickets.start(request.body));}
      catch(e){return reply.code(400).send({message:e instanceof Error?e.message:'No pude iniciar el ticket.'});}
    });
    app.post<{Params:{id:string}}>(prefix+'/:id/cancel',async(request)=>tickets.cancel(request.params.id));
    app.post<{Params:{id:string}}>(prefix+'/:id/open',async(request)=>tickets.open(request.params.id));
  }
  app.post('/api/voice/synthesize',async(request,reply) => {
    const {text} = z.object({text:z.string().trim().min(1).max(220)}).strict().parse(request.body);
    if (!voice.status().available || voice.status().busy) return reply.code(503).send({message:'Voz local no disponible; usá la voz del navegador.'});
    return reply.type('audio/wav').send(await voice.synthesize(text));
  });
  app.get('/api/bridge/desktop/status',async()=>({mode:'read-only',local:true,projects:projects.list(),voice:voice.status()}));
  app.get('/api/bridge/desktop/files',async(request)=>{const args=query.parse(request.query);return projects.files(args.project,args.path);});
  app.get('/api/bridge/desktop/read',async(request)=>{const args=query.parse(request.query);return projects.read(args.project,args.path);});
  app.get('/api/bridge/desktop/git',async(request)=>{const args=query.parse(request.query);return projects.git(args.project);});
  app.get('/api/bridge/voice/status',async()=>voice.status());
  app.post('/api/bridge/voice/synthesize',async(request,reply)=>{
    const {text}=z.object({text:z.string().trim().min(1).max(220)}).strict().parse(request.body);
    if(!voice.status().available || voice.status().busy)return reply.code(503).send({message:'Voz ocupada o no disponible.'});
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
  app.addHook('onClose',async()=>{tickets.close();voice.close();});
  return app;
}
