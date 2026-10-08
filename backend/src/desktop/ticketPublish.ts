import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readTicketFile, redact } from './ticketFiles';
import type { TicketJob } from './tickets';

const exec=promisify(execFile);
const gitOptions=['-c','core.fsmonitor=false','-c','core.hooksPath=NUL'];
export type Publication={status:'publishing'|'published'|'pending'|'failed';message:string;commit?:string;url?:string};
export type PublishPlan={token:string;branch:string;remote:string;project:string;files:string[];diff:string};
type Deployment={state:string;url:string};
type PublishServices={push?:(branch:string)=>Promise<void>;deployment?:(commit:string)=>Promise<Deployment|undefined>;wait?:()=>Promise<void>};
class PublicationPendingError extends Error {}
function transient(error:unknown){const e=error as {message?:string;stderr?:string;killed?:boolean};return e.killed || /timed? out|timeout|Could not resolve|Failed to connect|Connection.*(?:reset|closed)|network|No hay conexión|ECONN|ENOTFOUND|EAI_AGAIN/i.test((e.stderr||'')+' '+(e.message||''));}
export class TicketPublisher {
  private scope?:Promise<string>;
  constructor(private workspace:string,private directory:string,private services:PublishServices={}){}
  private async git(args:string[]){return (await exec('git',[...gitOptions,...args],{cwd:this.workspace,windowsHide:true,timeout:60000,maxBuffer:4*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}})).stdout;}
  async checkDeployment(commit:string):Promise<Deployment|undefined>{
    const project=JSON.parse(await fs.readFile(path.join(this.workspace,'.vercel','project.json'),'utf8'));
    const cli=path.join(process.env.APPDATA||'','npm','node_modules','vercel','dist','vc.js');
    this.scope??=(async()=>{
      const {stdout}=await exec(process.execPath,[cli,'teams','ls','--json'],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});
      const team=JSON.parse(stdout).teams?.find((team:{id:string})=>team.id===project.orgId);
      if(!team?.slug)throw new Error('La vinculación local de Vercel apunta a un equipo sin acceso. Actualizá .vercel/project.json para el proyecto OhlimpiaERP.');
      return team.slug as string;
    })().catch(error=>{this.scope=undefined;throw error;});
    const {stdout}=await exec(process.execPath,[cli,'ls',project.projectName,'--scope',await this.scope,'--json'],{windowsHide:true,timeout:30000,maxBuffer:2*1024*1024});
    const rows=JSON.parse(stdout).deployments;
    if(!Array.isArray(rows))throw new Error('Vercel no devolvió el estado de los despliegues.');
    const match=rows.find((row:{target?:string;meta?:{githubCommitSha?:string}})=>row.target==='production' && row.meta?.githubCommitSha===commit);
    if(!match)return undefined;
    const url='https://'+match.url;
    if(!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(url))throw new Error('Vercel devolvió un enlace de despliegue inválido.');
    return {state:match.state,url};
  }
  private async pause(){await (this.services.wait?.()??new Promise(resolve=>setTimeout(resolve,10000)));}
  async waitForDeployment(commit:string):Promise<string>{
    for(let attempt=0;attempt<30;attempt++){
      let deployment:Deployment|undefined;
      try{deployment=await (this.services.deployment?.(commit)??this.checkDeployment(commit));}
      catch(error){if(!transient(error))throw error;if(attempt===29)throw new PublicationPendingError('Vercel no respondió a la consulta. El commit se conserva; Jarvis seguirá consultando el estado.');}
      if(deployment){
        const url=deployment.url.startsWith('https://')?deployment.url:'https://'+deployment.url;
        if(!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(url))throw new Error('Vercel devolvió un enlace de despliegue inválido.');
        if(deployment.state==='READY')return url;
        if(['ERROR','CANCELED','CANCELLED'].includes(deployment.state))throw new Error('El build de Vercel falló para este commit. Revisá los logs en '+url+'. El commit permanece subido.');
      }
      if(attempt<29)await this.pause();
    }
    throw new PublicationPendingError('El commit está subido, pero Vercel todavía no confirmó el deploy. Jarvis seguirá consultando el estado; no se creará otro commit.');
  }
  async plan(job:TicketJob):Promise<PublishPlan> {
    if(job.mode!=='project' || job.status!=='ready' || !job.baseline || !job.files?.length)throw new Error('El ticket debe estar preparado y tener cambios para publicar.');
    if(!job.checks?.some(c=>c.status==='passed') || job.checks.some(c=>c.status==='failed'))throw new Error('Primero deben aprobarse las comprobaciones del ticket.');
    const branch=(await this.git(['branch','--show-current'])).trim();
    if(!branch || !/^[a-zA-Z0-9_./-]+$/.test(branch))throw new Error('Revisá la rama de Git antes de publicar.');
    const remote=(await this.git(['remote','get-url','origin'])).trim();
    if(!/^(?:https:\/\/github\.com\/|git@github\.com:)[\w.-]+\/[\w.-]+(?:\.git)?$/.test(remote))throw new Error('El origen debe ser un repositorio de GitHub sin credenciales en la URL.');
    const project=JSON.parse(await fs.readFile(path.join(this.workspace,'.vercel','project.json'),'utf8'));
    if(project.projectName!=='ohlimpiaerp' || !/^prj_[\w]+$/.test(project.projectId) || !/^team_[\w]+$/.test(project.orgId))throw new Error('Vinculá este proyecto a OhlimpiaERP en Vercel antes de publicar.');
    const head=(await this.git(['rev-parse','HEAD'])).trim();
    if(job.publication?.commit && job.publication.commit!==head)throw new Error('La rama cambió después del commit del ticket. Revisá el historial antes de reintentar.');
    if(!job.publication?.commit && (await this.git(['diff','--name-only',job.baseline,'HEAD','--',...job.files])).trim())throw new Error('Hay cambios previos o posteriores en archivos del ticket. Revisalos en VS Code antes de publicar; no se incluirán automáticamente.');
    const index=path.join(this.directory,'tracking.index');
    const tracked=(await exec('git',[...gitOptions,'ls-files','--stage','-z','--',...job.files],{cwd:this.workspace,env:{...process.env,GIT_INDEX_FILE:index},windowsHide:true,maxBuffer:1024*1024})).stdout.split('\0').filter(Boolean);
    const hashes=new Map(tracked.map(line=>{const [,,hash,,name]=line.match(/^(\d+) ([a-f0-9]+) (\d+)\t(.+)$/s)||[];return [name,hash];}));
    for(const file of job.files){await readTicketFile(this.workspace,file);const hash=(await this.git(['hash-object','--',file])).trim();if(hash!==hashes.get(file))throw new Error('El archivo '+file+' cambió después de las pruebas. Retomá el ticket para comprobarlo antes de publicar.');}
    const diff=await this.git(['--no-pager','diff','HEAD','--',...job.files]);
    const token=createHash('sha256').update(JSON.stringify({head,branch,remote,project,files:job.files,hashes:[...hashes]})).digest('hex');
    return {token,branch,remote,project:project.projectName,files:job.files,diff:redact(diff).slice(0,100000)};
  }
  async publish(job:TicketJob,plan:PublishPlan,save:(publication:Publication)=>Promise<void>) {
    const publication:Publication={status:'publishing',message:'Creando el commit del ticket.',commit:job.publication?.commit};
    try {
      await save({...publication});
      if(!publication.commit){
        await this.git(['add','--',...plan.files]);
        await this.git(['commit','--only','-m','fix: resolver ticket con Jarvis '+job.id.slice(0,8),'--',...plan.files]);
        publication.commit=(await this.git(['rev-parse','HEAD'])).trim();await save({...publication});
      }
      publication.message='Subiendo el commit a GitHub.';await save({...publication});
      for(let attempt=0;attempt<3;attempt++){
        try{
          if(this.services.push)await this.services.push(plan.branch);
          else await this.git(['-c','credential.helper=','-c','credential.helper=!gh auth git-credential','push','origin',`${publication.commit}:refs/heads/${plan.branch}`]);
          break;
        }catch(error){if(!transient(error)||attempt===2)throw error;publication.message='Reintentando la conexión con GitHub; se conserva el mismo commit.';await save({...publication});await this.pause();}
      }
      publication.message='Commit subido. Esperando el deploy de Vercel desde GitHub.';await save({...publication});
      // GitHub triggers the production build. Confirm that exact SHA instead of uploading a second deployment.
      publication.url=await this.waitForDeployment(publication.commit!);
      publication.status='published';publication.message='Commit subido y despliegue completado. Probá el resultado en la web.';
    }catch(error){
      const command=error as {stderr?:string;stdout?:string;message?:string;killed?:boolean};
      const detail=command.stderr?.trim() || command.stdout?.trim() || command.message || 'No pude publicar.';
      publication.status=error instanceof PublicationPendingError?'pending':'failed';publication.message=redact((publication.commit?'El commit '+publication.commit.slice(0,12)+' se conserva. ':'')+(command.killed?'La consulta agotó el tiempo de espera. Reintentá; se conserva el mismo commit.':detail)).slice(-2000);
    }
    await save({...publication});
  }
}
