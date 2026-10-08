import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { TicketRunner } from './tickets';
import { readTicketFile,writeTicketFile,listTicketFiles } from './ticketFiles';
import { createBridgeToken,validBridgeToken } from '../security/bridge';
import { TicketPublisher } from './ticketPublish';
import { ticketIdentity } from './ticketIdentity';

async function fixture() {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jarvis-tickets-'));
  const project=path.join(root,'project');await fs.mkdir(project);
  await fs.writeFile(path.join(project,'package.json'),JSON.stringify({type:'module',scripts:{test:'node --test'}}));
  await fs.writeFile(path.join(project,'sum.js'),'export const sum=(a,b)=>a-b;');
  await fs.writeFile(path.join(project,'sum.test.js'),"import test from 'node:test';import assert from 'node:assert/strict';import {sum} from './sum.js';test('suma',()=>assert.equal(sum(2,3),5));");
  await fs.writeFile(path.join(project,'ticket.md'),'La suma da un resultado incorrecto.');
  await fs.writeFile(path.join(project,'.env'),'PRIVATE_SECRET=do-not-copy');
  const git=(args:string[])=>execFileSync('git',args,{cwd:project,windowsHide:true,stdio:'ignore'});
  git(['init']);git(['add','.']);git(['-c','user.name=Test','-c','user.email=test@localhost','commit','-m','fixture']);
  // Existing user edits must form the snapshot and remain untouched in the original.
  await fs.writeFile(path.join(project,'sum.js'),'// user edit\nexport const sum=(a,b)=>a-b;');
  return {root,project,config:{projects:[{id:'ohlimpiaerp',name:'OhlimpiaERP',root:project}]},async clean(){assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});}};
}
async function terminal(runner:TicketRunner,id:string) {
  const until=Date.now()+30000;
  while(Date.now()<until){const job=(await runner.list()).find(j=>j.id===id)!;if(['ready','failed','cancelled'].includes(job.status))return job;await new Promise(resolve=>setTimeout(resolve,100));}
  throw new Error('La tarea no terminó.');
}
test('ticket: cambios directos en el proyecto, conserva ediciones previas e índice Git',async()=>{
  const fixtureData=await fixture();const {root,project,config}=fixtureData;
  const runner=new TicketRunner(config,root,async(workspace)=>{
    assert((await readTicketFile(workspace,'sum.js')).includes('// user edit'));
    assert.equal(workspace,project);await assert.rejects(readTicketFile(workspace,'.env'));
    await writeTicketFile(workspace,'sum.js','// user edit\nexport const sum=(a,b)=>a+b;');
    return 'Corregí la suma.';
  });
  try {
    const job=await runner.start({project:'ohlimpiaerp',instruction:'Resolver el ticket de suma.',ticketPath:'ticket.md'});
    const finished=await terminal(runner,job.id);
    assert.equal(finished.status,'ready');assert(finished.diff?.includes('a+b'));assert(finished.files?.includes('sum.js'));
    assert(finished.checks?.some(c=>c.name==='Pruebas unitarias' && c.status==='passed'));
    assert((await fs.readFile(path.join(project,'sum.js'),'utf8')).includes('a+b'));
    assert.equal(execFileSync('git',['diff','--cached','--name-only'],{cwd:project,encoding:'utf8'}).trim(),'');
    assert(!finished.diff?.includes('+// user edit'));
    const reloaded=new TicketRunner(config,root);assert.equal((await reloaded.list())[0].status,'ready');
    const metadata=path.join(root,'data','ticket-jobs',job.id,'job.json');
    const legacy=JSON.parse(await fs.readFile(metadata,'utf8'));delete legacy.ticket;await fs.writeFile(metadata,JSON.stringify(legacy));
    await fs.writeFile(path.join(project,'ticket.md'),'# Error de suma\n\nNúmero visible: #77\nMódulo: Cálculos\n');
    const migrated=(await new TicketRunner(config,root).list())[0];
    assert.equal(migrated.ticket?.title,'Error de suma');assert.equal(migrated.ticket?.number,'#77');
    assert.equal(JSON.parse(await fs.readFile(metadata,'utf8')).ticket.title,'Error de suma');
  } finally{runner.close();await fixtureData.clean();}
});

test('informe: identifica tickets Markdown y HTML sin inventar el nombre',()=>{
  assert.deepEqual(ticketIdentity('# Correccion de bug\nNúmero visible: #134\nMódulo: Enfermos'),{title:'Correccion de bug',number:'#134',module:'Enfermos'});
  assert.equal(ticketIdentity('<h1>Dotación <em>pendiente</em></h1>')?.title,'Dotación pendiente');
  assert.equal(ticketIdentity('sin encabezado','tickets/suma.md')?.title,'suma');
  assert.equal(ticketIdentity(''),undefined);
});
test('ticket: fallo en las pruebas no se presenta como tarea resuelta',async()=>{
  const data=await fixture();const runner=new TicketRunner(data.config,data.root,async()=> 'Sin cambios.');
  try{const job=await runner.start({project:'ohlimpiaerp',instruction:'Resolver el ticket de suma.'});const finished=await terminal(runner,job.id);assert.equal(finished.status,'failed');assert(finished.checks?.some(c=>c.status==='failed'));}
  finally{runner.close();await data.clean();}
});

test('publicación: revisa destino, detecta cambios posteriores y exige aprobación vigente',async()=>{
  const data=await fixture();
  const git=(args:string[])=>execFileSync('git',args,{cwd:data.project,windowsHide:true,encoding:'utf8'});
  git(['add','sum.js']);git(['-c','user.name=Test','-c','user.email=test@localhost','commit','-m','user baseline']);
  git(['remote','add','origin','https://github.com/example/ohlimpiaerp.git']);
  await fs.mkdir(path.join(data.project,'.vercel'));
  await fs.writeFile(path.join(data.project,'.vercel','project.json'),JSON.stringify({projectName:'ohlimpiaerp',projectId:'prj_test',orgId:'team_test'}));
  const runner=new TicketRunner(data.config,data.root,async()=>{await writeTicketFile(data.project,'sum.js','export const sum=(a,b)=>a+b;');return 'Qué cambió: suma. Qué probar: sumar.';});
  try{
    const started=await runner.start({project:'ohlimpiaerp',instruction:'Resolver el ticket de suma.'});
    const job=await terminal(runner,started.id);
    const publisher=new TicketPublisher(data.project,path.join(data.root,'data','ticket-jobs',job.id));
    const plan=await runner.publishPlan(job.id);
    assert.equal(plan.project,'ohlimpiaerp');assert.equal(plan.remote,'https://github.com/example/ohlimpiaerp.git');assert(plan.diff.includes('a+b'));
    await assert.rejects(runner.publish(job.id,{token:plan.token,reviewed:false}));
    await assert.rejects(runner.publish(job.id,{token:'0'.repeat(64),reviewed:true}),/cambió desde la revisión/);
    assert.equal(git(['log','-1','--format=%s']).trim(),'user baseline');
    await fs.writeFile(path.join(data.project,'sum.js'),'export const sum=(a,b)=>a+b+1;');
    await assert.rejects(publisher.plan(job),/cambió después de las pruebas/);
    await fs.writeFile(path.join(data.project,'sum.js'),'export const sum=(a,b)=>a+b;');
    await assert.rejects(publisher.plan({...job,checks:[{name:'tests',status:'failed',output:'fallo'}]}),/comprobaciones/);
    git(['config','user.name','Test']);git(['config','user.email','test@localhost']);
    await fs.writeFile(path.join(data.project,'ticket.md'),'Otro cambio del usuario, ya staged.');git(['add','ticket.md']);
    let pushed=false;const states:NonNullable<typeof job.publication>[]=[];
    const publishing=new TicketPublisher(data.project,path.join(data.root,'data','ticket-jobs',job.id),{
      push:async()=>{pushed=true;},
      deployment:async commit=>{assert(pushed);assert.equal(commit,git(['rev-parse','HEAD']).trim());return {state:'READY',url:'test-deployment.vercel.app'};}
    });
    await publishing.publish(job,plan,async publication=>{states.push(publication);});
    assert.equal(states.at(-1)?.status,'published');assert.equal(states.at(-1)?.url,'https://test-deployment.vercel.app');
    assert.equal(git(['show','--format=','--name-only','HEAD']).trim(),'sum.js');
    assert.equal(git(['diff','--cached','--name-only']).trim(),'ticket.md','conserva cambios ajenos staged');
    const committedJob={...job,publication:states.at(-1)};
    let failed:typeof job.publication;
    let pushAttempts=0;
    const failing=new TicketPublisher(data.project,path.join(data.root,'data','ticket-jobs',job.id),{push:async()=>{pushAttempts++;throw new Error('No hay conexión');},wait:async()=>{}});
    await failing.publish(committedJob,await failing.plan(committedJob),async publication=>{failed=publication;});
    assert.equal(failed?.status,'failed');assert.equal(failed?.commit,states.at(-1)?.commit);
    assert.equal(pushAttempts,3,'reintenta errores de conexión sin duplicar commits');
    assert.equal(git(['rev-parse','HEAD']).trim(),failed?.commit,'no duplica el commit al reintentar');
  }finally{runner.close();await data.clean();}
});

test('publicación: espera el SHA exacto de Vercel y distingue build fallido de pendiente',async()=>{
  let queries=0,waits=0;
  const publisher=new TicketPublisher('unused','unused',{deployment:async commit=>{
    assert.equal(commit,'expected-sha');queries++;
    return queries===1?undefined:{state:queries===2?'BUILDING':'READY',url:'matched-sha.vercel.app'};
  },wait:async()=>{waits++;}});
  assert.equal(await publisher.waitForDeployment('expected-sha'),'https://matched-sha.vercel.app');assert.equal(waits,2);
  const failed=new TicketPublisher('unused','unused',{deployment:async()=>({state:'ERROR',url:'failed-build.vercel.app'})});
  await assert.rejects(failed.waitForDeployment('sha'),/build de Vercel falló/);
  const absent=new TicketPublisher('unused','unused',{deployment:async()=>undefined,wait:async()=>{}});
  await assert.rejects(absent.waitForDeployment('sha'),/todavía no confirmó/);
  let networkQueries=0;
  const reconnect=new TicketPublisher('unused','unused',{deployment:async()=>{if(++networkQueries===1)throw new Error('ECONNRESET');return {state:'READY',url:'reconnected.vercel.app'};},wait:async()=>{}});
  assert.equal(await reconnect.waitForDeployment('sha'),'https://reconnected.vercel.app');assert.equal(networkQueries,2);
});
test('ticket: límites de archivos y credencial distinta del puente de lectura',async()=>{
  const data=await fixture();
  try {
    for(const name of ['../outside.js','.env','data/private.md','sum.js:stream'])await assert.rejects(readTicketFile(data.project,name));
    for(const name of ['../outside.js','.claude/settings.json','package.json','vite.config.js'])await assert.rejects(writeTicketFile(data.project,name,'{}'));
    await fs.symlink(data.root,path.join(data.project,'link'),process.platform==='win32'?'junction':'dir');
    await assert.rejects(writeTicketFile(data.project,'link/outside.js','test'));
    assert(!(await listTicketFiles(data.project)).some(f=>f.path==='.env' || f.path==='link'));
    const key='test-only-key'.repeat(4),token=createBridgeToken(key,Date.now(),'tickets');assert(validBridgeToken(token,key,Date.now(),'tickets'));assert(!validBridgeToken(token,key));assert(!validBridgeToken(createBridgeToken(key),key,Date.now(),'tickets'));
  }finally{await data.clean();}
});
test('ticket: una sola tarea, cancelación y proyectos no autorizados',async()=>{
  const data=await fixture();const runner=new TicketRunner(data.config,data.root,async(_workspace,_prompt,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Cancelado')),{once:true})));
  try {
    await assert.rejects(runner.start({project:'jarvis',instruction:'No debe modificar Jarvis.'}));
    const requests=await Promise.allSettled([runner.start({project:'ohlimpiaerp',instruction:'Resolver el ticket de suma.'}),runner.start({project:'ohlimpiaerp',instruction:'Resolver el ticket duplicado.'})]);
    assert.equal(requests.filter(r=>r.status==='fulfilled').length,1);
    const job=(requests.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<{id:string}>).value;
    await runner.cancel(job.id);assert.equal((await terminal(runner,job.id)).status,'cancelled');
  }finally{runner.close();await data.clean();}
});
test('ticket: adjunto grande se consulta en el proyecto sin inflar el prompt',async()=>{
  const data=await fixture();const reference='jarvis-tickets/mockup.html';
  await fs.writeFile(path.join(data.project,'.gitignore'),'jarvis-tickets/\n');await fs.mkdir(path.join(data.project,'jarvis-tickets'));await fs.writeFile(path.join(data.project,reference),'<h1>Mockup</h1>'+'x'.repeat(80000));
  const runner=new TicketRunner(data.config,data.root,async(workspace,prompt)=>{
    assert(prompt.includes(reference));assert(prompt.length<10000);assert((await readTicketFile(workspace,reference)).length>64000);
    await writeTicketFile(workspace,'sum.js','export const sum=(a,b)=>a+b;');return 'Adjunto consultado.';
  });
  try{const job=await runner.start({project:'ohlimpiaerp',instruction:'Resolver el ticket con el mockup.',referencePaths:[reference]});assert.equal((await terminal(runner,job.id)).status,'ready');}
  finally{runner.close();await data.clean();}
});

test('ticket: retomar conserva cambios parciales, pedido original y diff completo',async()=>{
  const data=await fixture();let attempts=0;
  const runner=new TicketRunner(data.config,data.root,async(workspace,prompt)=>{
    assert(prompt.includes('Resolver la suma original.'));
    if(++attempts===1){await writeTicketFile(workspace,'sum.js','// user edit\nexport const sum=(a,b)=>a+b;');throw new Error('Conexión interrumpida.');}
    assert((await readTicketFile(workspace,'sum.js')).includes('a+b'));return 'La suma está corregida.';
  });
  try{
    const job=await runner.start({project:'ohlimpiaerp',instruction:'Resolver la suma original.',ticketPath:'ticket.md'});
    assert.equal((await terminal(runner,job.id)).status,'failed');
    await runner.retry(job.id);const finished=await terminal(runner,job.id);
    assert.equal(finished.status,'ready');assert(finished.diff?.includes('a+b'));assert(!finished.diff?.includes('+// user edit'));
    assert(finished.checks?.some(c=>c.name==='Pruebas unitarias' && c.status==='passed'));
    assert.equal(execFileSync('git',['diff','--cached','--name-only'],{cwd:data.project,encoding:'utf8'}).trim(),'');
  }finally{runner.close();await data.clean();}
});
