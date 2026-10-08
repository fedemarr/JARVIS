import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { TicketRunner } from './tickets';
import { readTicketFile,writeTicketFile,listTicketFiles } from './ticketFiles';
import { createBridgeToken,validBridgeToken } from '../security/bridge';

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
  } finally{runner.close();await fixtureData.clean();}
});
test('ticket: fallo en las pruebas no se presenta como tarea resuelta',async()=>{
  const data=await fixture();const runner=new TicketRunner(data.config,data.root,async()=> 'Sin cambios.');
  try{const job=await runner.start({project:'ohlimpiaerp',instruction:'Resolver el ticket de suma.'});const finished=await terminal(runner,job.id);assert.equal(finished.status,'failed');assert(finished.checks?.some(c=>c.status==='failed'));}
  finally{runner.close();await data.clean();}
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
