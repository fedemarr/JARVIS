import { useEffect, useState } from 'react';
import { ticketFetch } from '../lib/desktop';

type Job={id:string;status:string;message:string;summary?:string;diff?:string;files?:string[];checks?:{name:string;status:string;output:string}[]};
const running=(job:Job)=>['preparing','coding','checking'].includes(job.status);
const labels:Record<string,string>={preparing:'Preparando proyecto',coding:'Claude está trabajando',checking:'Ejecutando comprobaciones',ready:'Preparado para revisar',failed:'Requiere atención',cancelled:'Detenido'};
export function TicketAgentPanel({ticketPath}:{ticketPath:string}) {
  const [instruction,setInstruction]=useState('Resolvé el ticket respetando la arquitectura de OhlimpiaERP y agregá las pruebas necesarias.');
  const [available,setAvailable]=useState(false);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [notice,setNotice]=useState('Comprobando Claude Code…');
  const [busy,setBusy]=useState(false);
  async function refresh() {
    const response=await ticketFetch('/api/tickets',{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('No pude consultar los tickets.');
    setJobs(await response.json());
  }
  useEffect(()=>{
    let active=true;
    void ticketFetch('/api/tickets/status',{signal:AbortSignal.timeout(15000)}).then(async response=>{
      if(!response.ok)throw new Error();const status=await response.json();
      if(active){setAvailable(status.available===true);setNotice(status.available?'Claude Code conectado · usa tu sesión local':'Iniciá sesión en Claude Code en esta PC.');}
    }).catch(()=>{if(active)setNotice('El ejecutor no está disponible. Reconectá esta PC.');});
    void refresh().catch(()=>{});
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh().catch(()=>{});},4000);
    return()=>{active=false;clearInterval(timer);};
  },[]);
  async function start(text=instruction) {
    if(busy || jobs.some(running)){setNotice('Ya hay un ticket en ejecución.');return;}
    if(!available){setNotice('Claude Code necesita una sesión local activa.');return;}
    setBusy(true);
    try {
      const response=await ticketFetch('/api/tickets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:'ohlimpiaerp',instruction:text,...(ticketPath?{ticketPath}:{})}),signal:AbortSignal.timeout(20000)});
      const data=await response.json();if(!response.ok)throw new Error(data.message);
      setJobs(previous=>[data,...previous]);setNotice('Ticket iniciado. Podés seguir usando el chat mientras Claude trabaja.');
      window.dispatchEvent(new CustomEvent('jarvis-ticket-notice',{detail:'Inicié el ticket con Claude Code. Verás los cambios y las comprobaciones en el panel de OhlimpiaERP.'}));
    } catch(e){setNotice(e instanceof Error?e.message:'No pude iniciar el ticket.');}
    finally{setBusy(false);}
  }
  useEffect(()=>{
    const request=(event:Event)=>{const text=(event as CustomEvent<string>).detail;setInstruction(text);void start(text);};
    window.addEventListener('jarvis-run-ticket',request);
    return()=>window.removeEventListener('jarvis-run-ticket',request);
  },[available,busy,jobs,ticketPath,instruction]);
  async function action(id:string,action:'cancel'|'open') {
    try {const response=await ticketFetch(`/api/tickets/${id}/${action}`,{method:'POST',signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw new Error(data.message);setNotice(action==='open'?'Abrí la copia del ticket en VS Code.':'Deteniendo el ticket…');await refresh();}
    catch(e){setNotice(e instanceof Error?e.message:'No pude completar la operación.');}
  }
  return <section className="ticket-agent">
    <span className="eyebrow">CLAUDE CODE · TICKETS</span>
    <p>{ticketPath?`Ticket seleccionado: ${ticketPath}`:'Elegí un .md / .html de OhlimpiaERP arriba, o pegá el pedido acá.'}</p>
    <textarea aria-label="Pedido para Claude Code" value={instruction} onChange={event=>setInstruction(event.target.value)} rows={3} maxLength={32000} />
    <button type="button" disabled={!available || busy || jobs.some(running) || instruction.trim().length<10} onClick={()=>void start()}>{busy?'Iniciando…':'Resolver ticket con Claude'}</button>
    <p role="status">{notice}</p>
    <p>Prepara los cambios en una copia separada y ejecuta comprobaciones. Revisá el resultado antes de integrarlo; no publica ni cierra el ticket.</p>
    {jobs.slice(0,5).map(job=><article key={job.id} className="ticket-job">
      <strong>{labels[job.status] || job.status}</strong><p>{job.message}</p>
      {running(job)?<button type="button" onClick={()=>void action(job.id,'cancel')}>Detener tarea</button>:<button type="button" onClick={()=>void action(job.id,'open')}>Abrir cambios en VS Code</button>}
      {job.summary && <details><summary>Resumen de Claude</summary><pre>{job.summary}</pre></details>}
      {job.checks && <details><summary>Comprobaciones</summary>{job.checks.map((check,index)=><div key={index}><strong>{check.status==='passed'?'✓':check.status==='failed'?'✕':'Pendiente'} · {check.name}</strong><pre>{check.output}</pre></div>)}</details>}
      {job.diff && <details><summary>Ver cambios · {job.files?.length || 0} archivos</summary><pre>{job.diff}</pre></details>}
    </article>)}
  </section>;
}
