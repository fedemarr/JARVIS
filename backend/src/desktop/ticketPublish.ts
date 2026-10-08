import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readTicketFile, redact } from './ticketFiles';
import type { TicketJob } from './tickets';

const exec=promisify(execFile);
const gitOptions=['-c','core.fsmonitor=false','-c','core.hooksPath=NUL'];
export type Publication={status:'publishing'|'published'|'failed';message:string;commit?:string;url?:string};
export type PublishPlan={token:string;branch:string;remote:string;project:string;files:string[];diff:string};
type PublishServices={push?:(branch:string)=>Promise<void>;deploy?:(directory:string)=>Promise<string>};
export class TicketPublisher {
  constructor(private workspace:string,private directory:string,private services:PublishServices={}){}
  private async git(args:string[]){return (await exec('git',[...gitOptions,...args],{cwd:this.workspace,windowsHide:true,timeout:60000,maxBuffer:4*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}})).stdout;}
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
      if(this.services.push)await this.services.push(plan.branch);
      else await this.git(['-c','credential.helper=','-c','credential.helper=!gh auth git-credential','push','origin',`HEAD:refs/heads/${plan.branch}`]);
      publication.message='Publicando el commit en Vercel.';await save({...publication});
      // Export the committed tree only: unrelated edits in the user's project never enter the upload.
      const output=path.join(this.directory,'deploy-'+publication.commit),archive=path.join(this.directory,'deploy-'+publication.commit+'.tar');
      await fs.mkdir(output,{recursive:true});
      await this.git(['archive','--format=tar','--output='+archive,publication.commit!]);
      await exec('tar',['-xf',archive,'-C',output],{windowsHide:true,timeout:30000});
      await fs.mkdir(path.join(output,'.vercel'),{recursive:true});
      await fs.copyFile(path.join(this.workspace,'.vercel','project.json'),path.join(output,'.vercel','project.json'));
      const cli=path.join(process.env.APPDATA||'','npm','node_modules','vercel','dist','vc.js');
      const result=this.services.deploy?{stdout:await this.services.deploy(output),stderr:''}:await exec(process.execPath,[cli,'--prod','--yes'],{cwd:output,windowsHide:true,timeout:600000,maxBuffer:1024*1024});
      const urls=(result.stdout+'\n'+result.stderr).match(/https:\/\/[a-z0-9.-]+\.vercel\.app/g);
      if(!urls?.length)throw new Error('Vercel no devolvió el enlace de la publicación. Revisá el panel de despliegues.');
      publication.status='published';publication.url=urls[urls.length-1];publication.message='Commit subido y despliegue completado. Probá el resultado en la web.';
    }catch(error){publication.status='failed';publication.message=redact(error instanceof Error?error.message:'No pude publicar.').slice(0,2000);}
    await save({...publication});
  }
}
