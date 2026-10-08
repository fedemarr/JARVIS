import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ReadOnlyProjects } from './projects';
import { buildDesktopApp } from './app';
import { BRIDGE_ORIGIN, createBridgeToken, validBridgeToken } from '../security/bridge';
import { createSession, validSession } from '../security/auth';

test('lectura: proyecto explícito, secretos, traversal, junctions, tamaño y Git fijo', async() => {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'jarvis-desktop-'));
  const root=path.join(temp,'project'),outside=path.join(temp,'outside');
  await fs.mkdir(root);await fs.mkdir(outside);
  const projects=new ReadOnlyProjects({projects:[{id:'test',name:'Test',root}]});
  try {
    await fs.writeFile(path.join(root,'ticket.md'),'Corregir el botón de guardar.');
    await fs.writeFile(path.join(root,'.env'),'private');
    await fs.mkdir(path.join(root,'data'));
    await fs.writeFile(path.join(root,'data','private.txt'),'private');
    await fs.writeFile(path.join(root,'leak.md'),'postgresql://user:password@example.com/database');
    await fs.writeFile(path.join(root,'large.md'),'x'.repeat(64001));
    await fs.writeFile(path.join(outside,'outside.md'),'private');
    await fs.symlink(outside,path.join(root,'linked'),process.platform==='win32'?'junction':'dir');
    assert.equal((await projects.read('test','ticket.md')).text,'Corregir el botón de guardar.');
    for(const file of ['../outside/outside.md','.env','data/private.txt','linked/outside.md','leak.md','large.md','ticket.md:stream']) await assert.rejects(projects.read('test',file));
    await assert.rejects(projects.read('unknown','ticket.md'));
    assert.deepEqual((await projects.files('test')).map((f)=>f.name).sort(),['large.md','leak.md','ticket.md']);
    execFileSync('git',['init'],{cwd:root,windowsHide:true,stdio:'ignore'});
    const git=await projects.git('test');assert.equal(git.mode,'read-only');assert(git.changes.some((line)=>line.includes('ticket.md')));assert(!git.changes.some((line)=>line.includes('.env')));
  } finally {
    // Solo borrar los archivos temporales creados por esta prueba.
    assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));
    await fs.rm(temp,{recursive:true,force:true});
  }
});

test('API local: sesión obligatoria, origen/host, sin comandos ni escritura', async()=>{
  const original={key:process.env.JARVIS_ACCESS_KEY,origins:process.env.ALLOWED_ORIGINS,mode:process.env.JARVIS_MODE};
  process.env.JARVIS_ACCESS_KEY='test-only-key-'.repeat(4);process.env.ALLOWED_ORIGINS='http://127.0.0.1:3002,'+BRIDGE_ORIGIN;process.env.JARVIS_MODE='desktop';
  const app=buildDesktopApp({projects:[{id:'test',name:'Test',root:process.cwd()}]},path.resolve('nonexistent-test-voice-root'));
  const headers={host:'127.0.0.1:3002'};
  try {
    assert.equal((await app.inject({url:'/api/desktop/status',headers})).statusCode,401);
    const login=await app.inject({method:'POST',url:'/api/session',headers,payload:{accessKey:process.env.JARVIS_ACCESS_KEY}});
    const cookie=String(login.headers['set-cookie']).split(';')[0];const auth={...headers,cookie};
    assert.equal((await app.inject({url:'/api/desktop/status',headers:auth})).json().mode,'read-only');
    assert.equal((await app.inject({url:'/api/desktop/status',headers:{...auth,origin:'https://evil.example'}})).statusCode,403);
    assert.equal((await app.inject({url:'/api/desktop/status',headers:{...auth,host:'evil.example'}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/api/execute_command',headers:auth,payload:{command:'whoami'}})).statusCode,404);
    assert.equal((await app.inject({url:'/api/desktop/read?project=test&path=../private.md',headers:auth})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/api/voice/synthesize',headers:auth,payload:{text:'x'.repeat(221)}})).statusCode,400);
    const bridge={...headers,origin:BRIDGE_ORIGIN,authorization:'Bearer '+createBridgeToken(process.env.JARVIS_ACCESS_KEY!)};
    const status=await app.inject({url:'/api/bridge/desktop/status',headers:bridge});
    assert.equal(status.statusCode,200);assert.equal(status.headers['access-control-allow-origin'],BRIDGE_ORIGIN);
    assert.equal((await app.inject({url:'/api/bridge/desktop/status',headers:{...bridge,origin:'https://evil.example'}})).statusCode,403);
    assert.equal((await app.inject({url:'/api/bridge/desktop/status',headers:auth})).statusCode,401,'Cookie local no sustituye la autorización del puente');
    assert.equal((await app.inject({method:'POST',url:'/api/bridge/chat',headers:bridge,payload:{message:'hello'}})).statusCode,401,'El token solo permite lectura y voz');
    assert.equal((await app.inject({method:'POST',url:'/api/bridge/tickets',headers:bridge,payload:{project:'ohlimpiaerp',instruction:'Resolver este ticket.'}})).statusCode,401,'La credencial de lectura no puede iniciar tareas');
    const ticketAuth={...headers,origin:BRIDGE_ORIGIN,authorization:'Bearer '+createBridgeToken(process.env.JARVIS_ACCESS_KEY!,Date.now(),'tickets')};
    assert.equal((await app.inject({url:'/api/bridge/tickets/status',headers:ticketAuth})).statusCode,200);
    assert.equal((await app.inject({url:'/api/bridge/desktop/status',headers:ticketAuth})).statusCode,401,'La credencial de tareas no habilita otras rutas');
    assert.equal((await app.inject({method:'OPTIONS',url:'/api/bridge/desktop/status',headers:{...headers,origin:BRIDGE_ORIGIN,'access-control-request-method':'GET','access-control-request-headers':'authorization'}})).statusCode,204);
  } finally {await app.close();for(const [key,value] of Object.entries({JARVIS_ACCESS_KEY:original.key,ALLOWED_ORIGINS:original.origins,JARVIS_MODE:original.mode})) {if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('credencial de puente: firma, propósito y vencimiento separados de la sesión',()=>{
  const key='test-only-key-'.repeat(4),now=Date.now();const token=createBridgeToken(key,now);
  assert(validBridgeToken(token,key,now));
  assert(!validBridgeToken(token,key,now+600000));
  assert(!validBridgeToken(token,'different-key',now));
  assert(!validBridgeToken(token.slice(0,-1)+'X',key,now));
  assert(!validBridgeToken(createSession(key,now),key,now));
  assert(!validSession(token,key,now));
});
