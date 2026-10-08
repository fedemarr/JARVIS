import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from 'pg';
import {MigrationRunner} from './migrations';
import {migrationStatements,atomicMigrationSql} from './migrationSql';

test('SQL: transacción externa, comentarios, funciones y cadenas con punto y coma',()=>{
  const parts=migrationStatements("-- nota\nBEGIN; INSERT INTO t VALUES ('a;b'); DO $fn$ BEGIN RAISE NOTICE 'x;y'; END; $fn$; COMMIT;");
  assert.equal(parts.length,2);assert(parts[1].includes("'x;y'"));
  assert.throws(()=>migrationStatements('BEGIN; INSERT INTO t VALUES(1);'),/no termina/);
  assert.throws(()=>migrationStatements('INSERT INTO t VALUES(1); COMMIT;'),/fuera de una transacción/);
  assert.throws(()=>migrationStatements('CREATE INDEX CONCURRENTLY idx ON t(id);'),/ejecución especial/);
  assert.throws(()=>migrationStatements("SELECT 'sin cerrar"),/sin cerrar/);
  const batch=atomicMigrationSql('v198_test.sql','a'.repeat(64),"BEGIN; INSERT INTO t VALUES ('O''Brien'); COMMIT;",true);
  assert(batch.endsWith('ROLLBACK;'));assert(batch.includes("EXECUTE 'INSERT INTO t VALUES (''O''''Brien'')'"));
  assert(!batch.includes('INSERT INTO jarvis_admin.schema_migrations (version,file,checksum) VALUES'));
  assert(atomicMigrationSql('v198_test.sql','a'.repeat(64),'SELECT 1;',false).endsWith('COMMIT;'));
});

test('SQL: dry run revierte, producción requiere prueba vigente y registra una sola aplicación',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jarvis-sql-')),project=path.join(root,'project');await fs.mkdir(path.join(project,'sql'),{recursive:true});
  const file='v198_test.sql';await fs.writeFile(path.join(project,'sql',file),'BEGIN; INSERT INTO public.t VALUES(1); COMMIT;');
  const queries:string[]=[];let checksum:string|undefined,fail=false;
  const fake={connect:async()=>{},end:async()=>{},query:async(sql:string,values?:unknown[])=>{
    queries.push(sql);if(sql.startsWith('SELECT checksum'))return {rows:checksum?[{checksum}]:[]};
    if(sql.startsWith('INSERT INTO public.t')&&fail)throw new Error('SQL inválido');
    if(sql.startsWith('INSERT INTO jarvis_admin'))checksum=values![2] as string;
    return {rows:[]};
  }} as unknown as Client;
  const runner=new MigrationRunner({projects:[{id:'ohlimpiaerp',name:'ERP',root:project}]},root,async()=>({ref:'test',client:fake}));
  try{
    const plan=await runner.plan(file);
    await assert.rejects(runner.execute(file,plan.sha,'production'),/Primero debe aprobarse/);
    assert.equal((await runner.execute(file,plan.sha,'staging')).status,'tested');assert(queries.includes('ROLLBACK'));assert(!queries.includes('COMMIT'));assert.equal(checksum,undefined);
    queries.length=0;fail=true;await assert.rejects(runner.execute(file,plan.sha,'production'),/SQL inválido/);assert(queries.includes('ROLLBACK'));assert(!queries.includes('COMMIT'));
    queries.length=0;fail=false;assert.equal((await runner.execute(file,plan.sha,'production')).status,'applied');assert(queries.includes('COMMIT'));assert.equal(checksum,plan.sha);
    queries.length=0;assert.equal((await runner.execute(file,plan.sha,'production')).status,'already-applied');assert(!queries.some(q=>q.startsWith('INSERT INTO public.t')));
    await fs.writeFile(path.join(project,'sql',file),'INSERT INTO public.t VALUES(2);');await assert.rejects(runner.execute(file,plan.sha,'production'),/cambió desde/);
    await assert.rejects(runner.plan('../.env'),/Elegí un archivo/);
  }finally{assert(root.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});}
});
