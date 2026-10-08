import { useEffect, useState } from 'react';
import { ticketFetch, readErpTickets } from '../lib/desktop';
import { parseTicketCommand, setTicketContext } from '../lib/ticketCommand';

type Job={id:string;status:string;message:string;editorOpened?:boolean;editorError?:string;summary?:string;diff?:string;files?:string[];checks?:{name:string;status:string;output:string}[]};
type ErpTicket={id:string;number:string;title:string;priority:string;state:string};
const running=(job:Job)=>['preparing','coding','checking'].includes(job.status);
const labels:Record<string,string>={preparing:'Preparando proyecto',coding:'Claude está trabajando',checking:'Ejecutando comprobaciones',ready:'Preparado para revisar',failed:'Requiere atención',cancelled:'Detenido'};
export function TicketAgentPanel({ticketPath}:{ticketPath:string}) {
  const [instruction,setInstruction]=useState('Resolvé el ticket respetando la arquitectura de OhlimpiaERP y agregá las pruebas necesarias.');
  const [available,setAvailable]=useState(false);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [notice,setNotice]=useState('Comprobando Claude Code…');
  const [busy,setBusy]=useState(false);
  const [erpTickets,setErpTickets]=useState<ErpTicket[]>([]);
  const [erpLoaded,setErpLoaded]=useState(false);
  const [erpSelector,setErpSelector]=useState('siguiente');
  const [erpNotice,setErpNotice]=useState('');
  const [showHistory,setShowHistory]=useState(false);
  async function refresh() {
    const response=await ticketFetch('/api/tickets',{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('No pude consultar los tickets.');
    setJobs(await response.json());
  }
  useEffect(()=>{
    let active=true;
    void readErpTickets().then(rows=>{
      if(active){setErpLoaded(true);setTicketContext(rows);setErpTickets([...rows.filter((t:ErpTicket)=>/^(abierto|en progreso)$/i.test(t.state)),...rows.filter((t:ErpTicket)=>!/^(abierto|en progreso)$/i.test(t.state))]);}
    }).catch(()=>{});
    void ticketFetch('/api/tickets/status',{signal:AbortSignal.timeout(15000)}).then(async response=>{
      if(!response.ok)throw new Error();const status=await response.json();
      if(active){setAvailable(status.available===true);setNotice(status.available?'Claude Code conectado · usa tu sesión local':'Iniciá sesión en Claude Code en esta PC.');}
    }).catch(()=>{if(active)setNotice('El ejecutor no está disponible. Reconectá esta PC.');});
    void refresh().catch(()=>{});
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh().catch(()=>{});},4000);
    return()=>{active=false;clearInterval(timer);};
  },[]);
  async function start(text=instruction,fromErp?:string) {
    if(busy || jobs.some(running)){setNotice('Ya hay un ticket en ejecución.');return;}
    if(!available){setNotice('Claude Code necesita una sesión local activa.');return;}
    setBusy(true);
    try {
      const response=await ticketFetch(fromErp?'/api/tickets/erp/run':'/api/tickets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fromErp?{selector:fromErp,instruction:text.length<10?'Resolvé el ticket seleccionado: '+text:text,openEditor:true}:{project:'ohlimpiaerp',instruction:text,openEditor:true,...(ticketPath?{ticketPath}:{})}),signal:AbortSignal.timeout(fromErp?180000:20000)});
      const data=await response.json();if(!response.ok)throw new Error(data.message);
      setJobs(previous=>[data,...previous]);setNotice('Ticket iniciado. Podés seguir usando el chat mientras Claude trabaja.');
      window.dispatchEvent(new CustomEvent('jarvis-ticket-notice',{detail:'Inicié el ticket con Claude Code en tu proyecto original de OhlimpiaERP y lo voy a abrir en VS Code. Las comprobaciones aparecerán en el panel.'}));
    } catch(e){const message=e instanceof Error?e.message:'No pude iniciar el ticket.';setNotice(message);window.dispatchEvent(new CustomEvent('jarvis-ticket-notice',{detail:message}));}
    finally{setBusy(false);}
  }
  useEffect(()=>{
    const request=(event:Event)=>{
      const text=(event as CustomEvent<string>).detail;setInstruction(text);
      const command=parseTicketCommand(text);if(!command)return;
      if(command.action==='list'){void erpAction('list');return;}
      if(!command.selector && (command.erp || !ticketPath)) {
        const message='Indicame el nombre o número del ticket de la web, o decí «el siguiente ticket».';
        setNotice(message);window.dispatchEvent(new CustomEvent('jarvis-ticket-notice',{detail:message}));return;
      }
      const fromErp=command.selector && (command.erp || !ticketPath)?command.selector:undefined;
      void start(text,fromErp);
    };
    window.addEventListener('jarvis-run-ticket',request);
    return()=>window.removeEventListener('jarvis-run-ticket',request);
  },[available,busy,jobs,ticketPath,instruction]);
  async function action(id:string,action:'cancel'|'open'|'retry') {
    try {const response=await ticketFetch(`/api/tickets/${id}/${action}`,{method:'POST',signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw new Error(data.message);setNotice(action==='open'?'Abrí el proyecto del ticket en VS Code.':action==='retry'?'Retomando el ticket con Claude…':'Deteniendo el ticket…');await refresh();}
    catch(e){setNotice(e instanceof Error?e.message:'No pude completar la operación.');}
  }
  async function erpAction(action:'connect'|'list') {
    setBusy(true);setErpNotice(action==='connect'?'Abriendo OhlimpiaERP…':'Consultando la bandeja…');
    try {
      const data=action==='list'?await readErpTickets():await (async()=>{const response=await ticketFetch('/api/tickets/erp/connect',{method:'POST',signal:AbortSignal.timeout(60000)});const value=await response.json();if(!response.ok)throw new Error(value.message);return value;})();
      if(action==='connect')setErpNotice(data.message);
      else {
        const pending=data.filter((ticket:ErpTicket)=>/^(abierto|en progreso)$/i.test(ticket.state));
        setTicketContext(data);
        setErpLoaded(true);
        const completed=data.filter((ticket:ErpTicket)=>!/^(abierto|en progreso)$/i.test(ticket.state));
        setErpTickets([...pending,...completed]);
        setErpNotice(`Encontré ${data.length} tickets: ${pending.length} pendientes. «Siguiente» toma el primer pendiente en el orden de la bandeja.`);
        const detail=pending.length
          ? `Hay ${pending.length} tickets pendientes en OhlimpiaERP. ${pending.slice(0,8).map((ticket:ErpTicket)=>`${ticket.number}: ${ticket.title}, ${ticket.state}.`).join(' ')} Podés indicarme cuál resolver.`
          : 'No hay tickets pendientes en OhlimpiaERP.';
        window.dispatchEvent(new CustomEvent('jarvis-ticket-notice',{detail}));
      }
    }catch(e){const message=e instanceof Error?e.message:'No pude conectar con OhlimpiaERP.';setErpNotice(message);window.dispatchEvent(new CustomEvent('jarvis-ticket-notice',{detail:message}));}
    finally{setBusy(false);}
  }
  const activeJobs=jobs.filter(running);
  const visibleJobs=showHistory?jobs:activeJobs.length?activeJobs:jobs.slice(0,1);
  return <section className="ticket-agent">
    <div className="ticket-overview"><div><span className="eyebrow">TU ESPACIO DE TRABAJO</span><h2>De un ticket a una solución.</h2><p>{notice}</p></div><div className="ticket-metrics"><div><strong>{erpLoaded?erpTickets.filter(ticket=>/^(abierto|en progreso)$/i.test(ticket.state)).length:'—'}</strong><span>Pendientes</span></div><div><strong>{activeJobs.length}</strong><span>En ejecución</span></div></div></div>
    <div className="erp-inbox"><strong>OhlimpiaERP · bandeja en la web</strong>
      <div><button type="button" disabled={busy} onClick={()=>void erpAction('connect')}>Conectar OhlimpiaERP</button><button type="button" disabled={busy} onClick={()=>void erpAction('list')}>Ver tickets de la web</button></div>
      <select aria-label="Ticket de la web" value={erpSelector} onChange={event=>setErpSelector(event.target.value)}><option value="siguiente">Siguiente pendiente</option>{erpTickets.map(ticket=><option key={ticket.id} value={ticket.id}>{ticket.number} · {ticket.title} · {ticket.state}</option>)}</select>
      <button type="button" disabled={busy || !available || jobs.some(running)} onClick={()=>void start(instruction,erpSelector)}>Descargar y resolver ticket de la web</button>
      <p role="status">{erpNotice || 'Conectá tu usuario DEVELOPER una vez. Después Jarvis usa la sesión guardada en esta PC.'}</p>
    </div>
    <div className="ticket-request"><span className="eyebrow">INSTRUCCIONES PARA CLAUDE CODE</span><h3>Preparar el trabajo</h3>
    <p>{ticketPath?`Ticket seleccionado: ${ticketPath}`:'Usá la bandeja de OhlimpiaERP, seleccioná un archivo en Computadora o describí el pedido.'}</p>
    <textarea aria-label="Pedido para Claude Code" value={instruction} onChange={event=>setInstruction(event.target.value)} rows={3} maxLength={32000} />
    <button type="button" disabled={!available || busy || jobs.some(running) || instruction.trim().length<10} onClick={()=>void start()}>{busy?'Iniciando…':'Resolver ticket con Claude'}</button>
    <p role="status">{notice}</p>
    <p>Claude modifica tu proyecto original de OhlimpiaERP y ejecuta comprobaciones. El historial de Git y los cambios previos se conservan. No publica ni cierra el ticket automáticamente.</p>
    </div>
    <div className="ticket-executions"><div className="execution-heading"><div><span className="eyebrow">SEGUIMIENTO</span><h3>{activeJobs.length?'Trabajo en curso':'Último trabajo'}</h3></div><button type="button" aria-expanded={showHistory} onClick={()=>setShowHistory(value=>!value)}>{showHistory?'Ocultar historial':`Ver historial · ${jobs.length}`}</button></div>
    {jobs.length===0 && <div className="jobs-empty">Todavía no hay ejecuciones. Elegí un ticket para empezar.</div>}
    {visibleJobs.map(job=><article key={job.id} className={`ticket-job ticket-job-${job.status}`}>
      <strong>{labels[job.status] || job.status}</strong><p>{job.message}</p>
      {job.editorOpened && <p>Proyecto abierto en VS Code · Claude Code está conectado al ejecutor local.</p>}
      {job.editorError && <p role="status">{job.editorError}</p>}
      {running(job)?<button type="button" onClick={()=>void action(job.id,'cancel')}>Detener tarea</button>:<button type="button" onClick={()=>void action(job.id,'open')}>Abrir cambios en VS Code</button>}
      {['failed','cancelled'].includes(job.status) && <button type="button" disabled={jobs.some(running)} onClick={()=>void action(job.id,'retry')}>Retomar con Claude</button>}
      {job.summary && <details><summary>Resumen de Claude</summary><pre>{job.summary}</pre></details>}
      {job.checks && <details><summary>Comprobaciones</summary>{job.checks.map((check,index)=><div key={index}><strong>{check.status==='passed'?'✓':check.status==='failed'?'✕':'Pendiente'} · {check.name}</strong><pre>{check.output}</pre></div>)}</details>}
      {job.diff && <details><summary>Ver cambios · {job.files?.length || 0} archivos</summary><pre>{job.diff}</pre></details>}
    </article>)}
    </div>
  </section>;
}
