import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from 'dotenv';
import {Client} from 'pg';
import {DesktopConfig} from './projects';
import {readTicketFile,redact} from './ticketFiles';
import {migrationStatements,atomicMigrationSql} from './migrationSql';

const productionRef='caeqsieiuunqvicfpudu';
const namePattern=/^v(\d+)_[-a-zA-Z0-9_]+\.sql$/;
type Target='staging'|'production';
type Result={file:string;sha:string;target:Target;status:'tested'|'applied'|'already-applied';message:string;at:string};
type Connection={ref:string;client:Client};
export class MigrationRunner {
  private busy=false;
  constructor(private config:DesktopConfig,private root:string,private factory?:(target:Target)=>Promise<Connection>){}
  private workspace(){const project=this.config.projects.find(p=>p.id==='ohlimpiaerp');if(!project)throw new Error('OhlimpiaERP no está configurado.');return project.root;}
  private async env(filename:string){try{return parse(await fs.readFile(filename));}catch{return {};}}
  private async httpsToken(){return (await this.env(path.join(this.root,'.env'))).OHLIMPIA_SUPABASE_ACCESS_TOKEN || process.env.OHLIMPIA_SUPABASE_ACCESS_TOKEN;}
  private async httpsQuery(ref:string,token:string,query:string,parameters:unknown[]=[],readOnly=false){
    const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,parameters,read_only:readOnly}),redirect:'error',signal:AbortSignal.timeout(90000)});
    if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(`Supabase no pudo ejecutar la consulta (HTTP ${response.status}): ${redact(String(body.message||'Revisá los permisos del token.').split(token).join('[OCULTO]'))}`);}
    return response.json();
  }
  private async result(file:string,sha:string,target:Target,status:Result['status'],message:string){
    const result:Result={file,sha,target,status,message,at:new Date().toISOString()};
    await fs.mkdir(path.join(this.root,'data','sql-migrations'),{recursive:true});
    await fs.writeFile(path.join(this.root,'data','sql-migrations',(target==='production'&&status==='tested'?'production-test':target)+'-'+sha+'.json'),JSON.stringify(result,null,2));
    return result;
  }
  private async configuration(target:Target):Promise<Connection>{
    if(this.factory)return this.factory(target);
    if(target==='production'){
      const env=await this.env(path.join(this.root,'.env'));
      const value=env.OHLIMPIA_DATABASE_URL || process.env.OHLIMPIA_DATABASE_URL;
      if(!value)throw new Error('Falta OHLIMPIA_DATABASE_URL en el .env privado de Jarvis.');
      const url=new URL(value),user=decodeURIComponent(url.username);
      if(!['postgres:','postgresql:'].includes(url.protocol) || !url.password || !(url.hostname===`db.${productionRef}.supabase.co` || (/\.pooler\.supabase\.com$/.test(url.hostname)&&user===`postgres.${productionRef}`)))throw new Error('La conexión debe apuntar a la base de producción de OhlimpiaERP. No se ejecutó SQL.');
      for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
      const caPath=env.OHLIMPIA_DB_CA_PATH;const ca=caPath?await fs.readFile(caPath,'utf8'):undefined;
      return {ref:productionRef,client:new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},connectionTimeoutMillis:12000,query_timeout:90000,application_name:'Jarvis migrations'})};
    }
    const env=await this.env(path.join(this.workspace(),'.env.staging'));
    const ref=env.STAGING_PROJECT_REF;
    if(!ref || ref===productionRef || env.STAGING_DB_USER!==`postgres.${ref}` || !/\.pooler\.supabase\.com$/.test(env.STAGING_DB_HOST||'') || !env.STAGING_DB_PASSWORD)throw new Error('Falta una conexión staging válida y separada de producción.');
    const local=await this.env(path.join(this.root,'.env'));const ca=local.OHLIMPIA_DB_CA_PATH?await fs.readFile(local.OHLIMPIA_DB_CA_PATH,'utf8'):undefined;
    return {ref,client:new Client({host:env.STAGING_DB_HOST,port:Number(env.STAGING_DB_PORT)||5432,user:env.STAGING_DB_USER,password:env.STAGING_DB_PASSWORD,database:env.STAGING_DB_NAME||'postgres',ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},connectionTimeoutMillis:12000,query_timeout:90000,application_name:'Jarvis migration dry run'})};
  }
  private async record(file:string,sha:string,target:Target|'production-test'){try{return JSON.parse(await fs.readFile(path.join(this.root,'data','sql-migrations',target+'-'+sha+'.json'),'utf8')) as Result;}catch{return undefined;}}
  async plan(file:string){
    if(!namePattern.test(file))throw new Error('Elegí un archivo sql/vNNN_nombre.sql de OhlimpiaERP.');
    const sql=await readTicketFile(this.workspace(),'sql/'+file),sha=createHash('sha256').update(sql).digest('hex');
    const statements=migrationStatements(sql);
    let configured=false,connectionMessage='';
    try{if(await this.httpsToken())configured=true;else{const {client}=await this.configuration('production');await client.end();configured=true;}}catch(error){connectionMessage=error instanceof Error?error.message:'Falta la conexión de producción.';}
    return {file,sha,sql,statements:statements.length,configured,connectionMessage,project:'OhlimpiaERP',staging:await this.record(file,sha,'staging'),productionTest:await this.record(file,sha,'production-test'),production:await this.record(file,sha,'production')};
  }
  async list(){
    const entries=await fs.readdir(path.join(this.workspace(),'sql'),{withFileTypes:true});
    return {files:entries.filter(e=>e.isFile()&&namePattern.test(e.name)).map(e=>e.name).sort((a,b)=>Number(b.match(namePattern)![1])-Number(a.match(namePattern)![1])),busy:this.busy};
  }
  async execute(file:string,sha:string,target:Target,dryRun=false):Promise<Result>{
    if(this.busy)throw new Error('Ya hay una migración en ejecución.');
    this.busy=true;let client:Client|undefined,committed=false;
    try{
      const plan=await this.plan(file);if(plan.sha!==sha)throw new Error('El SQL cambió desde la revisión. Volvé a abrirlo.');
      const isTest=target==='staging'||dryRun;
      if(!isTest&&plan.staging?.status!=='tested'&&plan.productionTest?.status!=='tested')throw new Error('Primero debe aprobarse una prueba revertida de este SQL.');
      const token=await this.httpsToken();
      if(token&&!this.factory){
        const ref=target==='production'?productionRef:(await this.env(path.join(this.workspace(),'.env.staging'))).STAGING_PROJECT_REF;
        if(!ref||!/^[a-z]{20}$/.test(ref)||target==='staging'&&ref===productionRef)throw new Error('El proyecto staging no es válido o coincide con producción.');
        await this.httpsQuery(ref,token,atomicMigrationSql(file,sha,plan.sql,isTest));
        if(!isTest){
          const rows=await this.httpsQuery(ref,token,'SELECT checksum FROM jarvis_admin.schema_migrations WHERE version=$1',[Number(file.match(namePattern)![1])],true);
          if(!Array.isArray(rows)||rows[0]?.checksum!==sha)throw new Error('Supabase no confirmó el registro de la migración. No se marcará como aplicada.');
        }
        return await this.result(file,sha,target,isTest?'tested':'applied',isTest?'Transacción de prueba revertida. No se aplicó la migración.':'Migración aplicada y verificada por HTTPS en producción.');
      }
      ({client}=await this.configuration(target));await client.connect();
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='60s'; SET LOCAL lock_timeout='8s'; SET LOCAL idle_in_transaction_session_timeout='90s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('jarvis-schema-migrations'))");
      await client.query('CREATE SCHEMA IF NOT EXISTS jarvis_admin; REVOKE ALL ON SCHEMA jarvis_admin FROM PUBLIC');
      await client.query('CREATE TABLE IF NOT EXISTS jarvis_admin.schema_migrations (version integer PRIMARY KEY, file text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()); REVOKE ALL ON jarvis_admin.schema_migrations FROM PUBLIC');
      const version=Number(file.match(namePattern)![1]);
      const existing=await client.query('SELECT checksum FROM jarvis_admin.schema_migrations WHERE version=$1',[version]);
      if(existing.rows.length){
        if(existing.rows[0].checksum!==sha)throw new Error('Esta versión ya fue aplicada con otro contenido. Creá una migración nueva.');
        await client.query('ROLLBACK');
      }else{
        for(const statement of migrationStatements(plan.sql))await client.query(statement);
        if(!isTest){
          await client.query('INSERT INTO jarvis_admin.schema_migrations (version,file,checksum) VALUES ($1,$2,$3)',[version,file,sha]);
          await client.query('COMMIT');committed=true;
        }else await client.query('ROLLBACK');
      }
      const result:Result={file,sha,target,status:isTest?'tested':existing.rows.length?'already-applied':'applied',message:isTest?'Transacción de prueba revertida. No se aplicó la migración.':existing.rows.length?'Esta migración ya estaba registrada. No se ejecutó otra vez.':'Migración aplicada y registrada en producción.',at:new Date().toISOString()};
      await fs.mkdir(path.join(this.root,'data','sql-migrations'),{recursive:true});
      try{await fs.writeFile(path.join(this.root,'data','sql-migrations',(target==='production'&&isTest?'production-test':target)+'-'+sha+'.json'),JSON.stringify(result,null,2));}catch{if(!committed)throw new Error('No pude guardar el resultado de la prueba.');}
      return result;
    }catch(error){await client?.query('ROLLBACK').catch(()=>{});throw new Error(redact(error instanceof Error?error.message:'No pude ejecutar la migración.'));}
    finally{await client?.end().catch(()=>{});this.busy=false;}
  }
}
